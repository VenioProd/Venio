// ─────────────────────────────────────────────────────────────
// Phase 2: consistency.nightly_data_integrity_check
// Vérification nocturne de la cohérence des données
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'
import logger from '../../lib/logger.js'

interface IntegrityIssue {
  category: string
  description: string
  entityId?: string
  severity: 'warning' | 'error'
}

const definition: AutomationDefinition = {
  key: 'consistency.nightly_data_integrity_check',
  title: 'Vérification nocturne de cohérence des données',
  domain: 'global',
  triggerType: 'cron',
  schedule: '02:00',
  channels: ['in_app', 'system_log'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 1,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `data_integrity:${ctx.dateKey}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const Project = mongoose.model('Project')
    const Task = mongoose.model('Task')
    const User = mongoose.model('User')
    const BillingDocument = mongoose.model('BillingDocument')
    const Lead = mongoose.model('Lead')

    const issues: IntegrityIssue[] = []

    // 1. Projects with no client
    const orphanProjects = await Project.find({
      client: { $ne: null },
      isArchived: { $ne: true },
    }).populate('client', '_id')

    for (const p of orphanProjects) {
      if (!p.client) {
        issues.push({
          category: 'Projet orphelin',
          description: `Le projet "${p.name}" référence un client supprimé`,
          entityId: p._id.toString(),
          severity: 'error',
        })
      }
    }

    // 2. Tasks referencing deleted projects
    const taskProjectIds = await Task.distinct('project')
    const existingProjectIds = await Project.find({
      _id: { $in: taskProjectIds },
    }).distinct('_id')

    const existingProjectSet = new Set(existingProjectIds.map((id: unknown) => (id as object).toString()))
    const orphanTaskProjects = taskProjectIds.filter(
      (id: unknown) => !existingProjectSet.has((id as object).toString())
    )

    if (orphanTaskProjects.length > 0) {
      const orphanTaskCount = await Task.countDocuments({ project: { $in: orphanTaskProjects } })
      issues.push({
        category: 'Tâches orphelines',
        description: `${orphanTaskCount} tâche(s) référencent ${orphanTaskProjects.length} projet(s) supprimé(s)`,
        severity: 'error',
      })
    }

    // 3. Active projects past end date but not marked complete
    const staleProjects = await Project.countDocuments({
      status: 'EN_COURS',
      isArchived: { $ne: true },
      endDate: { $lt: new Date(ctx.now.getTime() - 30 * 24 * 3600_000) }, // 30+ days past deadline
    })

    if (staleProjects > 0) {
      issues.push({
        category: 'Projets en retard',
        description: `${staleProjects} projet(s) "EN_COURS" avec une deadline dépassée de plus de 30 jours`,
        severity: 'warning',
      })
    }

    // 4. Invoices with missing client reference
    const invoicesNoClient = await BillingDocument.countDocuments({
      client: null,
      type: 'FACTURE',
    })

    if (invoicesNoClient > 0) {
      issues.push({
        category: 'Factures sans client',
        description: `${invoicesNoClient} facture(s) n'ont pas de client associé`,
        severity: 'error',
      })
    }

    // 5. Leads assigned to inactive users
    const inactiveUserIds = await User.find({ isActive: false }).distinct('_id')
    if (inactiveUserIds.length > 0) {
      const leadsWithInactiveOwner = await Lead.countDocuments({
        assignedTo: { $in: inactiveUserIds },
        status: { $nin: ['WON', 'LOST'] },
        isArchived: { $ne: true },
      })

      if (leadsWithInactiveOwner > 0) {
        issues.push({
          category: 'Leads non suivis',
          description: `${leadsWithInactiveOwner} lead(s) actif(s) assigné(s) à des utilisateurs inactifs`,
          severity: 'warning',
        })
      }
    }

    // 6. Duplicate client emails
    const duplicateEmails = await User.aggregate([
      { $match: { role: 'CLIENT' } },
      { $group: { _id: '$email', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])

    if (duplicateEmails.length > 0) {
      issues.push({
        category: 'Doublons clients',
        description: `${duplicateEmails.length} email(s) client en doublon : ${duplicateEmails.map((d: { _id: string }) => d._id).join(', ')}`,
        severity: 'warning',
      })
    }

    const actionsExecuted = [`integrity_check:${issues.length}_issues`]
    const recipientsNotified: string[] = []

    // Notify super admins if issues found
    if (issues.length > 0) {
      const admins = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id')

      const errorCount = issues.filter((i) => i.severity === 'error').length
      const warningCount = issues.filter((i) => i.severity === 'warning').length

      const summary = issues
        .slice(0, 8)
        .map((i) => `• [${i.severity === 'error' ? 'ERREUR' : 'ATTENTION'}] ${i.category}: ${i.description}`)
        .join('\n')

      for (const admin of admins) {
        await createNotification({
          recipient: admin._id.toString(),
          type: 'SYSTEM_ALERT' as never,
          title: `Intégrité données : ${errorCount} erreur(s), ${warningCount} avertissement(s)`,
          message: summary,
          link: '/admin/audit',
        })
        recipientsNotified.push(admin._id.toString())
      }
    }

    // System log
    if (issues.length > 0) {
      logger.warn(`[DATA INTEGRITY] ${issues.length} issue(s) found:`)
      for (const issue of issues) {
        logger.warn(`  [${issue.severity}] ${issue.category}: ${issue.description}`)
      }
    } else {
      logger.info('[DATA INTEGRITY] All checks passed ✓')
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: {
        issuesFound: issues.length,
        issues: issues.map((i) => ({ ...i })),
      },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
