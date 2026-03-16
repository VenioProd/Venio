// ─────────────────────────────────────────────────────────────
// Phase 1: digest.zero_oversight_morning_routine
// Routine quotidienne zero oubli — digest par utilisateur
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

interface DigestItem {
  category: string
  title: string
  link: string
  urgency: 'haute' | 'moyenne'
}

const definition: AutomationDefinition = {
  key: 'digest.zero_oversight_morning_routine',
  title: 'Routine quotidienne zero oubli',
  domain: 'global',
  triggerType: 'cron',
  schedule: '07:00',
  channels: ['in_app'],
  recipientStrategy: ['all_internal_active'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'],

  buildIdempotencyKey: (ctx) => `digest.zero_oversight:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')
    const Task = mongoose.model('Task')
    const Lead = mongoose.model('Lead')
    const Project = mongoose.model('Project')
    const BillingDocument = mongoose.model('BillingDocument')

    const internalUsers = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH'] },
      isActive: { $ne: false },
    }).select('_id name role')

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    for (const user of internalUsers) {
      const userId = user._id.toString()
      const items: DigestItem[] = []
      const isSuperAdmin = user.role === 'SUPER_ADMIN'

      // 1. Taches en retard assignees a cet utilisateur
      const overdueTasks = await Task.find({
        assignedTo: user._id,
        dueDate: { $lt: ctx.now },
        status: { $nin: ['TERMINE', 'VALIDE'] },
      }).populate('project', 'name').limit(10)

      for (const t of overdueTasks) {
        items.push({
          category: 'Tache en retard',
          title: t.title,
          link: `/admin/projets/${(t.project as { _id?: unknown })?._id}?tab=tasks`,
          urgency: 'haute',
        })
      }

      // 2. Taches dues aujourd'hui
      const todayStart = new Date(ctx.now)
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(ctx.now)
      todayEnd.setHours(23, 59, 59, 999)

      const dueTodayTasks = await Task.find({
        assignedTo: user._id,
        dueDate: { $gte: todayStart, $lte: todayEnd },
        status: { $nin: ['TERMINE', 'VALIDE'] },
      }).populate('project', 'name').limit(5)

      for (const t of dueTodayTasks) {
        items.push({
          category: 'Due aujourd\'hui',
          title: t.title,
          link: `/admin/projets/${(t.project as { _id?: unknown })?._id}?tab=tasks`,
          urgency: 'haute',
        })
      }

      // 3. Super admin: factures impayees
      if (isSuperAdmin) {
        const unpaidInvoices = await BillingDocument.find({
          type: 'FACTURE',
          status: { $in: ['ENVOYEE', 'EN_ATTENTE'] },
          dueDate: { $lt: ctx.now },
        }).populate('client', 'name').limit(5)

        for (const inv of unpaidInvoices) {
          const clientName = (inv.client as { name?: string })?.name || ''
          items.push({
            category: 'Facture impayee',
            title: `${inv.number || 'Facture'} — ${clientName}`,
            link: `/admin/projets/${inv.project}?tab=billing`,
            urgency: 'moyenne',
          })
        }

        // 4. Leads chauds non traites
        const hotLeads = await Lead.find({
          leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] },
          status: { $nin: ['WON', 'LOST'] },
          isArchived: { $ne: true },
          updatedAt: { $lt: new Date(ctx.now.getTime() - 2 * 24 * 3600_000) },
        }).limit(5)

        for (const lead of hotLeads) {
          items.push({
            category: 'Lead chaud non traite',
            title: `${lead.company} (${lead.contactName})`,
            link: '/admin/crm',
            urgency: 'haute',
          })
        }
      }

      // Skip if nothing to report
      if (items.length === 0) continue

      // Build digest notification
      const highPriority = items.filter((i) => i.urgency === 'haute').length
      const total = items.length

      const summary = items
        .slice(0, 5)
        .map((i) => `• [${i.category}] ${i.title}`)
        .join('\n')

      await createNotification({
        recipient: userId,
        type: 'DAILY_DIGEST' as never,
        title: `Bonjour ${user.name?.split(' ')[0] || ''} — ${highPriority} urgence(s), ${total} point(s) a traiter`,
        message: summary + (total > 5 ? `\n... et ${total - 5} autre(s)` : ''),
        link: '/admin',
      })

      recipientsNotified.push(userId)
      actionsExecuted.push(`digest:user:${userId}:${total}_items`)
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { usersProcessed: internalUsers.length },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
