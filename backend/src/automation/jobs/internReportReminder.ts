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

    // Stagiaires/alternants actifs dont le stage est en cours
    const activeInterns = await Intern.find({
      status: 'ACTIF',
      dateDebut: { $lte: ctx.now },
      dateFin: { $gte: ctx.now },
    }).populate('userId', 'name email')

    for (const intern of activeInterns) {
      const user = intern.userId as any
      if (!user?.email) continue

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
        }
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { summary: `${actionsExecuted.length} rappel(s) envoyé(s)` },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
