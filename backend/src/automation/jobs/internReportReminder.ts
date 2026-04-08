// intern.report_reminder — rappel email si pas de rapport depuis 3 jours
import { registerAutomation } from '../registry.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import Intern from '../../models/Intern.js'
import ActivityReport from '../../models/ActivityReport.js'
import { sendInternReportReminderEmail } from '../../lib/email/templates/report.js'

const definition: AutomationDefinition = {
  key: 'intern.report_reminder',
  title: 'Rappel rapport d\'activité (3 jours)',
  domain: 'interns',
  triggerType: 'cron',
  schedule: '09:00',
  channels: ['email'],
  recipientStrategy: ['custom'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `intern.report_reminder:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []
    const errors: string[] = []

    // Le statut ACTIF est la source de vérité
    const activeInterns = await Intern.find({
      status: 'ACTIF',
      inclureEquipe: { $ne: false },
    }).populate('userId', 'name email')

    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
    const todayName = dayNames[ctx.now.getDay()]

    for (const intern of activeInterns) {
      const user = intern.userId as any
      if (!user?.email) {
        errors.push(`intern:${intern._id}:no_email`)
        continue
      }

      // Défaut = tous les jours de semaine si le champ est vide
      const joursPresence: string[] = Array.isArray(intern.joursPresence) && intern.joursPresence.length > 0
        ? intern.joursPresence as string[]
        : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
      if (!joursPresence.includes(todayName)) continue

      // Dernier rapport soumis
      const lastReport = await ActivityReport.findOne({ internId: intern._id })
        .sort({ date: -1 })
        .select('date')
        .lean()

      const lastDate = lastReport ? new Date(lastReport.date) : null
      const daysSince = lastDate
        ? Math.floor((ctx.now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        : null

      // Envoyer si pas de rapport du tout, ou dernier rapport >= 3 jours
      if (daysSince === null || daysSince >= 3) {
        const loginUrl = `${process.env.APP_URL || 'https://venio.paris'}/espace-client/login`
        const result = await sendInternReportReminderEmail({
          to: user.email,
          internName: user.name,
          internType: intern.type,
          poste: intern.poste,
          daysSinceLastReport: daysSince ?? 0,
          loginUrl,
        })
        if (result.sent) {
          actionsExecuted.push(`reminder_sent:${user.email}`)
          recipientsNotified.push(user.email)
        } else {
          errors.push(`smtp_error:${user.email}:${result.error || 'unknown'}`)
        }
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        summary: `${actionsExecuted.length} rappel(s) envoyé(s)`,
        today: todayName,
        totalInterns: activeInterns.length,
        errors,
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
