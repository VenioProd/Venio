// ─────────────────────────────────────────────────────────────
// brief.deadline_reminder
// Rappel des briefs proches de la deadline ou en retard
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'brief.deadline_reminder',
  title: 'Rappel deadline brief de mission',
  domain: 'briefs',
  triggerType: 'cron',
  schedule: '08:00',
  channels: ['in_app'],
  recipientStrategy: ['assigned_user'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `brief.deadline:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const MissionBrief = mongoose.model('MissionBrief')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const twoDaysFromNow = new Date(ctx.now.getTime() + 2 * 24 * 3600_000)

    // Briefs with deadline within 2 days or overdue
    const urgentBriefs = await MissionBrief.find({
      statut: { $nin: ['VALIDE', 'LIVRE', 'NON_VALIDE'] },
      deadline: { $lte: twoDaysFromNow },
    }).populate('destinataire', '_id name').populate('project', 'name')

    for (const brief of urgentBriefs) {
      const destinataire = brief.destinataire as { _id: unknown; name?: string } | null
      if (!destinataire) continue

      const recipientId = (destinataire._id as object).toString()
      const projectName = (brief.project as { name?: string })?.name || ''
      const deadline = new Date(brief.deadline)
      const isOverdue = deadline < ctx.now
      const daysLabel = isOverdue
        ? `en retard de ${Math.floor((ctx.now.getTime() - deadline.getTime()) / 86400_000)}j`
        : `dans ${Math.ceil((deadline.getTime() - ctx.now.getTime()) / 86400_000)}j`

      await createNotification({
        recipient: recipientId,
        type: 'BRIEF_REMINDER' as never,
        title: isOverdue ? `Brief en retard : ${brief.titre || projectName}` : `Brief deadline proche : ${brief.titre || projectName}`,
        message: `Le brief "${brief.titre || 'Sans titre'}" (${projectName}) — deadline ${daysLabel}`,
        link: `/admin/briefs/${(brief._id as object).toString()}`,
      })

      actionsExecuted.push(`brief_deadline:${(brief._id as object).toString()}:${isOverdue ? 'overdue' : 'upcoming'}`)
      if (!recipientsNotified.includes(recipientId)) {
        recipientsNotified.push(recipientId)
      }
    }

    // Stale briefs: status A_FAIRE and created > 48h ago
    const fortyEightHoursAgo = new Date(ctx.now.getTime() - 48 * 3600_000)

    const staleBriefs = await MissionBrief.find({
      statut: 'A_FAIRE',
      createdAt: { $lt: fortyEightHoursAgo },
    }).populate('createdBy', '_id name').populate('project', 'name')

    for (const brief of staleBriefs) {
      const creator = brief.createdBy as { _id: unknown; name?: string } | null
      if (!creator) continue

      const creatorId = (creator._id as object).toString()
      const projectName = (brief.project as { name?: string })?.name || ''

      await createNotification({
        recipient: creatorId,
        type: 'BRIEF_REMINDER' as never,
        title: `Brief non commencé depuis 48h+`,
        message: `Le brief "${brief.titre || 'Sans titre'}" (${projectName}) est toujours "A_FAIRE" depuis plus de 48h`,
        link: `/admin/briefs/${(brief._id as object).toString()}`,
      })

      actionsExecuted.push(`brief_stale:${(brief._id as object).toString()}`)
      if (!recipientsNotified.includes(creatorId)) {
        recipientsNotified.push(creatorId)
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { urgentBriefs: urgentBriefs.length, staleBriefs: staleBriefs.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
