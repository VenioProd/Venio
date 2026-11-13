/**
 * Planificateur CRM : tâches quotidiennes et hebdomadaires (e-mails de relance,
 * escalade, rappels de tâches, factures, santé client, rapport hebdomadaire).
 *
 * ── Une seule source par comportement ───────────────────────────────────────
 * Trois systèmes savent relancer : ce planificateur, les jobs du moteur
 * d'automatisations (`automation/jobs/crm*.ts`) et les règles CRM (CrmRule).
 * Pour un même comportement, une seule source agit, dans cet ordre de priorité :
 *   1. la règle prédéfinie, si elle est ACTIVE (lecture en base, cache 60 s :
 *      `isSystemRuleActive` dans `lib/crmRules.ts`) ;
 *   2. sinon ce planificateur, si son réglage CRM est activé ;
 *   3. sinon le job du moteur d'automatisations.
 * Une règle ne s'abstient jamais à cause d'un job ou du planificateur.
 *
 * | Comportement               | Règle (systemKey)          | Planificateur (réglage)                         | Job (clé)                       |
 * |----------------------------|----------------------------|-------------------------------------------------|---------------------------------|
 * | Relance de proposition     | proposition-sans-reponse   | processProposalReminders (proposalReminderEnabled) | crm.proposal_followup        |
 * | Relance de lead inactif    | relance-7j                 | processColdLeads (coldLeadEmailEnabled)         | crm.inactive_lead_followup      |
 * | Relance après une démo     | relance-post-demo          | —                                               | crm.post_demo_followup          |
 * | Alerte lead chaud          | lead-chaud-48h             | —                                               | crm.hot_lead_untreated_alert    |
 * | Conversion d'un lead gagné | gagne-client-projet        | — (applyLeadChange → processWonLead, idempotent) | (crm.auto_convert_won_lead supprimé) |
 * | Escalade d'un lead inactif | —                          | processEscalations (escalationEnabled)          | —                               |
 * | Actions en retard          | —                          | processOverdueActions, processLeadFollowUps      | —                               |
 * | Archivage des perdus       | —                          | —                                               | crm.auto_archive_lost           |
 *
 * ── Heures et jours ─────────────────────────────────────────────────────────
 * Toutes les heures de déclenchement et la notion de « jour » sont celles de
 * Paris (`automation/jobs/crmParisTime.ts`), quel que soit le fuseau du serveur.
 * Une tâche quotidienne part à son heure, ou dans les `CATCH_UP_MINUTES` qui
 * suivent si le serveur était arrêté à ce moment-là.
 *
 * ── Une seule exécution par occurrence ──────────────────────────────────────
 * « Déjà fait aujourd'hui » est un verrou en base (`models/SchedulerLock.ts`),
 * clé = tâche + jour (ou semaine) de Paris, pris par insertion unique : sûr avec
 * plusieurs instances et après un redémarrage.
 */
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Task from '../models/Task.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import BillingDocument from '../models/BillingDocument.js'
import Project from '../models/Project.js'
import MissionBrief from '../models/MissionBrief.js'
import {
  getDaysSinceContact,
  getDaysOverdue,
  getDaysSinceStatusChange,
  getRoundRobinAssignee,
  logLeadActivity,
} from './crmAutomations.js'
import { createNotification } from './notifications.js'
import {
  sendColdLeadsReminderEmail,
  sendOverdueActionsEmail,
  sendEscalationEmail,
  sendProposalReminderEmail,
  sendWeeklyReportEmail,
  sendInvoiceReminderEmail,
  sendTaskReminderEmail,
  sendBriefReminderEmail,
} from './email.js'
import { invoicePaymentBalance } from './projectFinance/payments.js'
import logger from './logger.js'
import { withActiveLeads as activeLeads } from '../automation/jobs/crmLeadScope.js'
import { teamLeadFilter } from './crmScope.js'

import { parisParts, parisWeekKey, parseHHMM } from '../automation/jobs/crmParisTime.js'
import { acquireSchedulerLock, releaseSchedulerLock } from '../models/SchedulerLock.js'
import { isCoveredByActiveRule, SYSTEM_RULE_FOR } from './crmRules.js'
import { proposalReminderCutoff, proposalReminderDaysOf } from './crmProposalReminder.js'

const withActiveLeads = (filter: Record<string, unknown>) =>
  activeLeads({
    ...filter,
    $and: [...((filter.$and as Record<string, unknown>[]) ?? []), teamLeadFilter()],
  })

interface SchedulerResult {
  processed: number
  sent: number
  /** Règle active qui assure ce comportement : la tâche s'est abstenue. */
  skippedForRule?: string
  error?: string
}

interface EscalationResult {
  processed: number
  escalated: number
  reassigned?: number
  notified?: number
  error?: string
}

interface WeeklyReportResult {
  sent: boolean
  recipients?: number
  error?: string
}

interface OverdueTasksResult {
  processed: number
  notified: number
  error?: string
}

interface InvoiceReminderResult {
  processed: number
  sent: number
  error?: string
}

interface TaskReminderResult {
  processed: number
  notified: number
  error?: string
}

interface ProjectDeadlineResult {
  processed: number
  notified: number
  error?: string
}

interface BriefReminderResult {
  processed: number
  notified: number
  error?: string
}

interface ClientHealthResult {
  processed: number
  updated: number
  error?: string
}

const DAY_MS = 24 * 3600 * 1000

/**
 * Process cold leads and send reminder emails
 */
export async function processColdLeads(): Promise<SchedulerResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.coldLeadEmailEnabled) return { processed: 0, sent: 0 }
    if (await isCoveredByActiveRule('inactiveLeadFollowUp')) {
      return { processed: 0, sent: 0, skippedForRule: SYSTEM_RULE_FOR.inactiveLeadFollowUp }
    }

    const threshold = new Date()
    threshold.setDate(threshold.getDate() - settings.coldLeadThresholdDays)

    // Get cold leads grouped by assignee
    const coldLeads = await Lead.find(
      withActiveLeads({
        lastContactAt: { $lt: threshold },
        status: { $nin: ['WON', 'LOST'] },
        assignedTo: { $ne: null },
      }),
    ).populate('assignedTo', 'name email')

    // Group by assignee
    const byAssignee: Record<
      string,
      {
        assignee: { name: string; email: string }
        leads: Array<{ company: string; contactName: string; daysSinceContact: number | null }>
      }
    > = {}
    for (const lead of coldLeads) {
      const assignedTo = lead.assignedTo as unknown as {
        _id: { toString(): string }
        email?: string
        name: string
      } | null
      if (!assignedTo?.email) continue
      const assigneeId = assignedTo._id.toString()
      if (!byAssignee[assigneeId]) {
        byAssignee[assigneeId] = {
          assignee: assignedTo as { name: string; email: string },
          leads: [],
        }
      }
      byAssignee[assigneeId].leads.push({
        company: lead.company,
        contactName: lead.contactName,
        daysSinceContact: getDaysSinceContact(lead),
      })
    }

    // Send emails
    let sent = 0
    for (const assigneeId of Object.keys(byAssignee)) {
      const { assignee, leads } = byAssignee[assigneeId]
      const result = await sendColdLeadsReminderEmail({
        to: assignee.email,
        assigneeName: assignee.name,
        leads,
      })
      if (result.sent) sent++
    }

    return { processed: coldLeads.length, sent }
  } catch (err) {
    logger.error({ data: err }, 'Error processing cold leads:')
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
}

export async function processLeadFollowUps(): Promise<{ notified: number }> {
  const now = new Date()
  const leads = await Lead.find(
    withActiveLeads({
      nextActionAt: { $lte: now, $ne: null },
      status: { $nin: ['WON', 'LOST'] },
      assignedTo: { $ne: null },
      // Ne relit pas, à chaque minute, les échéances déjà notifiées.
      $expr: { $ne: ['$followUpNotifiedFor', '$nextActionAt'] },
    }),
  ).select('assignedTo nextActionAt followUpNotifiedFor company')
  let notified = 0
  for (const lead of leads) {
    const due = lead.nextActionAt!
    // Au premier passage, les anciennes échéances sont consommées sans rafale de notifications.
    const stale = !lead.followUpNotifiedFor && due.getTime() < now.getTime() - 7 * 86400000
    const result = await Lead.updateOne(
      withActiveLeads({
        _id: lead._id,
        nextActionAt: due,
        assignedTo: lead.assignedTo,
        status: { $nin: ['WON', 'LOST'] },
        followUpNotifiedFor: { $ne: due },
      }),
      { $set: { followUpNotifiedFor: due } },
    )
    if (!result.modifiedCount || stale) continue
    await createNotification({
      recipient: lead.assignedTo!,
      type: 'LEAD_FOLLOW_UP_DUE',
      title: 'Relance à effectuer',
      message: lead.company,
      link: `/admin/crm/leads/${lead._id}`,
      metadata: { leadId: String(lead._id) },
    })
    notified++
  }
  return { notified }
}

/**
 * Process overdue actions and send reminder emails
 */
export async function processOverdueActions(): Promise<SchedulerResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.dailyOverdueEmailEnabled) return { processed: 0, sent: 0 }

    const now = new Date()

    // Get overdue leads grouped by assignee
    const overdueLeads = await Lead.find(
      withActiveLeads({
        nextActionAt: { $lt: now },
        status: { $nin: ['WON', 'LOST'] },
        assignedTo: { $ne: null },
      }),
    ).populate('assignedTo', 'name email')

    // Group by assignee
    const byAssignee: Record<
      string,
      {
        assignee: { name: string; email: string }
        leads: Array<{ company: string; contactName: string; nextActionAt: Date | string; daysOverdue: number }>
      }
    > = {}
    for (const lead of overdueLeads) {
      const assignedTo = lead.assignedTo as unknown as {
        _id: { toString(): string }
        email?: string
        name: string
      } | null
      if (!assignedTo?.email) continue
      const assigneeId = assignedTo._id.toString()
      if (!byAssignee[assigneeId]) {
        byAssignee[assigneeId] = {
          assignee: assignedTo as { name: string; email: string },
          leads: [],
        }
      }
      byAssignee[assigneeId].leads.push({
        company: lead.company,
        contactName: lead.contactName,
        nextActionAt: lead.nextActionAt!,
        daysOverdue: getDaysOverdue(lead),
      })
    }

    // Send emails
    let sent = 0
    for (const assigneeId of Object.keys(byAssignee)) {
      const { assignee, leads } = byAssignee[assigneeId]
      const result = await sendOverdueActionsEmail({
        to: assignee.email,
        assigneeName: assignee.name,
        leads,
      })
      if (result.sent) sent++
    }

    return { processed: overdueLeads.length, sent }
  } catch (err) {
    logger.error({ data: err }, 'Error processing overdue actions:')
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
}

/** Fenêtre d'escalade : verrou par lead et par épisode d'inactivité, conservé un an. */
const ESCALATION_WINDOW_TTL_MS = 365 * DAY_MS
const CLOSED_LEAD_STATUSES = ['WON', 'LOST']

type EscalationLead = {
  _id: { toString(): string }
  createdAt?: Date | null
  lastInteractionAt?: Date | null
  lastContactAt?: Date | null
  statusChangedAt?: Date | null
}

/**
 * Dernier signe de vie d'un lead : échange consigné, contact saisi, changement
 * de statut ou création — jamais `updatedAt`, que la moindre écriture technique
 * (score, notification, règle) rafraîchit. Une réattribution automatique ouvre
 * une nouvelle période : le nouveau commercial dispose du même délai.
 */
export function escalationReference(lead: EscalationLead, lastAutoReassignAt?: Date | null): Date {
  const times = [lead.lastInteractionAt, lead.lastContactAt, lead.statusChangedAt, lead.createdAt, lastAutoReassignAt]
    .filter((d): d is Date => d != null)
    .map((d) => new Date(d).getTime())
  return new Date(times.length ? Math.max(...times) : 0)
}

const before = (field: string, threshold: Date) => ({ $or: [{ [field]: null }, { [field]: { $lt: threshold } }] })

/**
 * Escalade des leads inactifs.
 *
 * - Inactivité mesurée sur `lastInteractionAt`, `lastContactAt`,
 *   `statusChangedAt` (et la création), pas sur `updatedAt`.
 * - Un seul e-mail au manager par lead et par fenêtre d'inactivité (verrou
 *   `crm-scheduler:escalation:<lead>:<dernier signe de vie>`), pas un par jour.
 * - Au plus UNE réattribution automatique par lead (activité
 *   `ESCALATION_REASSIGN`) ; ensuite, seulement l'alerte au manager.
 * - La réattribution passe par `applyLeadChange` (source `scheduler`).
 */
export async function processEscalations(now: Date = new Date()): Promise<EscalationResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.escalationEnabled) return { processed: 0, escalated: 0 }

    const threshold = new Date(now.getTime() - settings.escalationThresholdDays * DAY_MS)

    const staleLeads = await Lead.find(
      withActiveLeads({
        status: { $nin: CLOSED_LEAD_STATUSES },
        assignedTo: { $ne: null },
        createdAt: { $lt: threshold },
        $and: [
          before('lastInteractionAt', threshold),
          before('lastContactAt', threshold),
          before('statusChangedAt', threshold),
        ],
      }),
    ).populate('assignedTo', 'name email')

    if (staleLeads.length === 0) return { processed: 0, escalated: 0, reassigned: 0, notified: 0 }

    // Réattributions automatiques déjà faites (une seule par lead).
    const reassignments = await LeadActivity.find({
      leadId: { $in: staleLeads.map((l) => l._id) },
      type: 'ESCALATION_REASSIGN',
    })
      .select('leadId createdAt')
      .lean()
    const lastReassign = new Map<string, Date>()
    for (const a of reassignments) {
      const key = String(a.leadId)
      const at = new Date(a.createdAt as Date)
      if (!lastReassign.has(key) || lastReassign.get(key)! < at) lastReassign.set(key, at)
    }

    const action = settings.escalationAction
    const manager = settings.escalationManagerId ? await User.findById(settings.escalationManagerId) : null
    let escalated = 0
    let reassigned = 0
    let notified = 0

    for (const lead of staleLeads) {
      const leadId = lead._id.toString()
      const alreadyReassigned = lastReassign.has(leadId)
      const reference = escalationReference(lead, lastReassign.get(leadId))
      // Réattribué récemment : le nouveau commercial a encore le délai devant lui.
      if (reference.getTime() >= threshold.getTime()) continue

      const wantsReassign = (action === 'REASSIGN' || action === 'BOTH') && !alreadyReassigned
      // Après l'unique réattribution, seule l'alerte au manager reste possible.
      const wantsNotify =
        action === 'NOTIFY_MANAGER' || action === 'BOTH' || (action === 'REASSIGN' && alreadyReassigned)
      const canNotify = wantsNotify && Boolean(manager?.email)
      if (!wantsReassign && !canNotify) continue

      const windowKey = `crm-scheduler:escalation:${leadId}:${reference.getTime()}`
      if (!(await acquireSchedulerLock(windowKey, ESCALATION_WINDOW_TTL_MS, now))) continue

      const days = Math.floor((now.getTime() - reference.getTime()) / DAY_MS)
      const assignedTo = lead.assignedTo as unknown as { _id?: { toString(): string }; name?: string } | null
      const previousAssignee = assignedTo?._id?.toString() ?? null
      let acted = false

      if (canNotify) {
        const result = await sendEscalationEmail({
          to: manager!.email,
          managerName: manager!.name,
          lead,
          assigneeName: assignedTo?.name || 'Non assigné',
          daysSinceAssignment: days,
        })
        if (result?.sent) {
          notified++
          acted = true
        }
      }

      if (wantsReassign) {
        let next = await getRoundRobinAssignee()
        if (next && String(next) === previousAssignee) next = await getRoundRobinAssignee()
        if (next && String(next) !== previousAssignee) {
          const { applyLeadChange } = await import('./crmLeadService.js')
          await applyLeadChange(
            lead._id.toString(),
            { assignedTo: String(next) },
            {
              actor: null,
              source: 'scheduler',
              settings,
              labelSuffix: '(escalade automatique)',
            },
          )
          await logLeadActivity(
            leadId,
            'ESCALATION_REASSIGN',
            `Lead réassigné automatiquement après ${days} jours d'inactivité`,
            { from: previousAssignee, to: String(next), days },
            null,
          )
          reassigned++
          acted = true
        }
      }

      if (acted) escalated++
      // Rien n'est parti (SMTP en panne, personne à qui réattribuer) : la fenêtre reste ouverte.
      else await releaseSchedulerLock(windowKey)
    }

    return { processed: staleLeads.length, escalated, reassigned, notified }
  } catch (err) {
    logger.error({ data: err }, 'Error processing escalations:')
    return { processed: 0, escalated: 0, error: (err as Error).message }
  }
}

/**
 * Process proposal reminders
 */
export async function processProposalReminders(): Promise<SchedulerResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.proposalReminderEnabled) return { processed: 0, sent: 0 }
    if (await isCoveredByActiveRule('proposalFollowUp')) {
      return { processed: 0, sent: 0, skippedForRule: SYSTEM_RULE_FOR.proposalFollowUp }
    }

    // Seuil partagé avec le job crm.proposal_followup (lib/crmProposalReminder.ts).
    const threshold = proposalReminderCutoff(new Date(), proposalReminderDaysOf(settings))

    // Find leads in PROPOSAL status for more than X days
    const proposalLeads = await Lead.find(
      withActiveLeads({
        status: 'PROPOSAL',
        statusChangedAt: { $lt: threshold },
        assignedTo: { $ne: null },
      }),
    ).populate('assignedTo', 'name email')

    let sent = 0
    for (const lead of proposalLeads) {
      const assignedTo = lead.assignedTo as unknown as { email?: string; name: string } | null
      if (!assignedTo?.email) continue

      const daysInProposal = getDaysSinceStatusChange(lead)
      const result = await sendProposalReminderEmail({
        to: assignedTo.email,
        assigneeName: assignedTo.name,
        lead,
        daysInProposal,
      })
      if (result.sent) sent++
    }

    return { processed: proposalLeads.length, sent }
  } catch (err) {
    logger.error({ data: err }, 'Error processing proposal reminders:')
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
}

/**
 * Generate and send weekly report
 */
export async function processWeeklyReport(): Promise<WeeklyReportResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.weeklyReportEnabled) return { sent: false }
    if (!settings.weeklyReportRecipients || settings.weeklyReportRecipients.length === 0) {
      return { sent: false, error: 'No recipients configured' }
    }

    // Calculate stats for the past week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Ces compteurs mesurent l'ACTIVITÉ de la semaine — des flux, pas une
    // cohorte. Les qualifications se comptent par transition et non par statut
    // courant : sinon un lead passé QUALIFIED puis DEMO dans la même semaine
    // n'apparaîtrait nulle part.
    const [newLeads, qualified, won, lost, allActive] = await Promise.all([
      Lead.countDocuments(withActiveLeads({ createdAt: { $gte: weekAgo } })),
      LeadActivity.countDocuments({
        type: 'STATUS_CHANGE',
        'payload.to': 'QUALIFIED',
        createdAt: { $gte: weekAgo },
      }),
      Lead.countDocuments(withActiveLeads({ status: 'WON', statusChangedAt: { $gte: weekAgo } })),
      Lead.countDocuments(withActiveLeads({ status: 'LOST', statusChangedAt: { $gte: weekAgo } })),
      Lead.find(withActiveLeads({ status: { $nin: ['WON', 'LOST'] } })),
    ])

    const totalActive = allActive.length
    const pipelineValue = allActive.reduce((sum, lead) => sum + (lead.budget || 0), 0)
    // Part des affaires CONCLUES cette semaine qui l'ont été favorablement.
    // L'ancien calcul divisait les gains de la semaine par les leads créés
    // dans la semaine : deux populations sans rapport, un ratio qui pouvait
    // dépasser 100 %.
    const settled = won + lost
    const conversionRate = settled > 0 ? Math.round((won / settled) * 100) : 0

    const stats = {
      newLeads,
      qualified,
      won,
      lost,
      totalActive,
      pipelineValue,
      conversionRate,
    }

    // Send to all recipients
    let sent = 0
    for (const email of settings.weeklyReportRecipients) {
      const result = await sendWeeklyReportEmail({ to: email, stats })
      if (result.sent) sent++
    }

    return { sent: sent > 0, recipients: sent }
  } catch (err) {
    logger.error({ data: err }, 'Error processing weekly report:')
    return { sent: false, error: (err as Error).message }
  }
}

/**
 * Process overdue tasks and notify assignees
 */
export async function processOverdueTasks(): Promise<OverdueTasksResult> {
  try {
    const now = new Date()
    const overdueTasks = await Task.find({
      dueDate: { $lt: now },
      status: { $nin: ['TERMINE'] },
      assignee: { $ne: null },
    })
      .populate('assignee', 'name email')
      .populate('project', 'name')

    let notified = 0
    for (const task of overdueTasks) {
      const assignee = task.assignee as unknown as { _id?: string } | null
      const project = task.project as unknown as { _id?: string; name?: string } | null
      if (!assignee?._id) continue

      await createNotification({
        recipient: assignee._id,
        type: 'TASK_UPDATED',
        title: 'Tâche en retard',
        message: `"${task.title}" dans ${project?.name || 'un projet'} est en retard`,
        link: `/admin/projets/${project?._id}?tab=tasks`,
        dedupeKey: `crm:task-overdue:${task._id}`,
      }).catch(() => {})

      notified++
    }

    return { processed: overdueTasks.length, notified }
  } catch (err) {
    logger.error({ data: err }, 'Error processing overdue tasks:')
    return { processed: 0, notified: 0, error: (err as Error).message }
  }
}

/**
 * Process invoice reminders — send reminder emails for overdue invoices
 */
export async function processInvoiceReminders(): Promise<InvoiceReminderResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.invoiceRemindersEnabled) return { processed: 0, sent: 0 }

    const reminderThreshold = new Date()
    reminderThreshold.setDate(reminderThreshold.getDate() - settings.invoiceReminderDays)

    // Find sent invoices that are past due and haven't had a reminder sent
    const overdueInvoices = await BillingDocument.find({
      type: 'INVOICE',
      // Un avoir est une facture de montant négatif : rien à réclamer.
      creditedInvoice: null,
      total: { $gt: 0 },
      status: { $in: ['SENT', 'ISSUED'] },
      dueAt: { $lt: new Date(), $ne: null },
      reminderSentAt: null,
    }).populate('client', 'name email')

    let sent = 0
    for (const invoice of overdueInvoices) {
      const client = invoice.client as unknown as { _id?: string; name?: string; email?: string } | null
      if (!client?.email) continue

      const dueAt = invoice.dueAt!
      const daysPastDue = Math.floor((Date.now() - dueAt.getTime()) / (1000 * 60 * 60 * 24))

      // Only send if past the configured reminder threshold
      if (daysPastDue < settings.invoiceReminderDays) continue

      const { remainingTtcCents } = await invoicePaymentBalance(invoice, null)
      if (remainingTtcCents <= 0) continue
      const amountStr = `${(remainingTtcCents / 100).toLocaleString('fr-FR')} ${invoice.currency}`
      const result = await sendInvoiceReminderEmail({
        to: client.email,
        name: client.name || client.email,
        invoiceNumber: invoice.number,
        amount: amountStr,
        daysPastDue,
      })

      if (result.sent) {
        invoice.reminderSentAt = new Date()
        await invoice.save()
        sent++
      }
    }

    return { processed: overdueInvoices.length, sent }
  } catch (err) {
    logger.error({ data: err }, 'Error processing invoice reminders:')
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
}

/**
 * Process task deadline reminders — notify assignees of tasks due within 24 hours
 */
export async function processTaskDeadlineReminders(): Promise<TaskReminderResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.taskRemindersEnabled) return { processed: 0, notified: 0 }

    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // Find tasks with dueDate within next 24 hours that are not completed
    const upcomingTasks = await Task.find({
      dueDate: { $gte: now, $lte: tomorrow },
      status: { $nin: ['TERMINE', 'VALIDE'] },
      assignee: { $ne: null },
    })
      .populate('assignee', 'name email')
      .populate('project', 'name')

    let notified = 0
    for (const task of upcomingTasks) {
      const assignee = task.assignee as unknown as { _id?: string; name?: string; email?: string } | null
      const project = task.project as unknown as { _id?: string; name?: string } | null
      if (!assignee?._id) continue

      // Create in-app notification
      await createNotification({
        recipient: assignee._id,
        type: 'TASK_UPDATED',
        title: 'Tâche bientôt à échéance',
        message: `"${task.title}" dans ${project?.name || 'un projet'} arrive à échéance demain`,
        link: `/admin/projets/${project?._id}?tab=tasks`,
        dedupeKey: `crm:task-deadline:${task._id}:${task.dueDate!.toISOString()}`,
      }).catch(() => {})

      // Send email
      if (assignee.email) {
        const dueDateStr = task.dueDate!.toLocaleDateString('fr-FR')
        await sendTaskReminderEmail({
          to: assignee.email,
          name: assignee.name || assignee.email,
          taskTitle: task.title,
          projectName: project?.name || 'Projet',
          dueDate: dueDateStr,
        }).catch(() => {})
      }

      notified++
    }

    return { processed: upcomingTasks.length, notified }
  } catch (err) {
    logger.error({ data: err }, 'Error processing task deadline reminders:')
    return { processed: 0, notified: 0, error: (err as Error).message }
  }
}

/**
 * Process project deadline alerts — notify team of projects ending within 7 days
 */
export async function processProjectDeadlineAlerts(): Promise<ProjectDeadlineResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.projectNotificationsEnabled) return { processed: 0, notified: 0 }

    const now = new Date()
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // Find active projects with endDate within 7 days
    const projects = await Project.find({
      endDate: { $gte: now, $lte: inSevenDays },
      status: { $ne: 'TERMINE' },
      isArchived: { $ne: true },
    }).populate('assignedTo', 'name email')

    let notified = 0
    for (const project of projects) {
      const assignedTo = project.assignedTo as unknown as { _id?: string; name?: string; email?: string } | null
      if (!assignedTo?._id) continue

      const daysLeft = Math.ceil((project.endDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      await createNotification({
        recipient: assignedTo._id,
        type: 'PROJECT_UPDATE',
        title: 'Échéance projet proche',
        message: `Le projet "${project.name}" arrive à échéance dans ${daysLeft} jour(s)`,
        link: `/admin/projets/${project._id}`,
        dedupeKey: `crm:project-deadline:${project._id}:${project.endDate!.toISOString()}`,
      }).catch(() => {})

      notified++
    }

    return { processed: projects.length, notified }
  } catch (err) {
    logger.error({ data: err }, 'Error processing project deadline alerts:')
    return { processed: 0, notified: 0, error: (err as Error).message }
  }
}

/**
 * Process brief deadline reminders — notify assignees of briefs due within 2 days
 */
export async function processBriefDeadlineReminders(): Promise<BriefReminderResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.briefRemindersEnabled) return { processed: 0, notified: 0 }

    const now = new Date()
    const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

    // Find briefs with deadline within 2 days that are not completed
    const briefs = await MissionBrief.find({
      deadline: { $gte: now, $lte: inTwoDays },
      statut: { $nin: ['VALIDE', 'LIVRE'] },
    }).populate('destinataire', 'name email')

    let notified = 0
    for (const brief of briefs) {
      const destinataire = brief.destinataire as unknown as { _id?: string; name?: string; email?: string } | null
      if (!destinataire?._id) continue

      const deadlineStr = brief.deadline.toLocaleDateString('fr-FR')

      // Create in-app notification
      await createNotification({
        recipient: destinataire._id,
        type: 'TASK_ASSIGNED',
        title: 'Brief bientôt à échéance',
        message: `Le brief "${brief.intitule}" arrive à échéance le ${deadlineStr}`,
        link: '/admin/gestion',
        dedupeKey: `crm:brief-deadline:${brief._id}:${brief.deadline.toISOString()}`,
      }).catch(() => {})

      // Send email
      if (destinataire.email) {
        await sendBriefReminderEmail({
          to: destinataire.email,
          name: destinataire.name || destinataire.email,
          briefTitle: brief.intitule,
          deadline: deadlineStr,
        }).catch(() => {})
      }

      notified++
    }

    return { processed: briefs.length, notified }
  } catch (err) {
    logger.error({ data: err }, 'Error processing brief deadline reminders:')
    return { processed: 0, notified: 0, error: (err as Error).message }
  }
}

/**
 * Auto-update client health status based on activity, projects, and invoices
 */
export async function processClientHealthAutoUpdate(): Promise<ClientHealthResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.clientHealthAutoUpdate) return { processed: 0, updated: 0 }

    const clients = await User.find({ role: 'CLIENT', status: { $in: ['ACTIF', 'PROSPECT', 'EN_PAUSE'] } })

    let updated = 0
    for (const client of clients) {
      const clientId = client._id

      // Gather data points
      const [activeProjects, overdueInvoices, lastProject] = await Promise.all([
        Project.countDocuments({ client: clientId, status: 'EN_COURS' }),
        BillingDocument.countDocuments({
          client: clientId,
          type: 'INVOICE',
          status: { $in: ['SENT', 'ISSUED'] },
          dueAt: { $lt: new Date() },
        }),
        Project.findOne({ client: clientId }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
      ])

      // Calculate health
      let newHealth: 'BON' | 'ATTENTION' | 'CRITIQUE' = 'BON'

      // Overdue invoices -> CRITIQUE
      if (overdueInvoices > 0) {
        newHealth = 'CRITIQUE'
      }
      // No active projects and no recent activity -> ATTENTION
      else if (activeProjects === 0) {
        const daysSinceActivity = lastProject?.updatedAt
          ? Math.floor((Date.now() - new Date(lastProject.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        if (daysSinceActivity > 30) {
          newHealth = 'ATTENTION'
        }
      }
      // Last contact long ago -> ATTENTION
      else if (client.lastContactAt) {
        const daysSinceContact = Math.floor(
          (Date.now() - new Date(client.lastContactAt).getTime()) / (1000 * 60 * 60 * 24),
        )
        if (daysSinceContact > 30) {
          newHealth = 'ATTENTION'
        }
      }

      if (client.healthStatus !== newHealth) {
        client.healthStatus = newHealth
        await client.save()
        updated++
      }
    }

    return { processed: clients.length, updated }
  } catch (err) {
    logger.error({ data: err }, 'Error processing client health auto-update:')
    return { processed: 0, updated: 0, error: (err as Error).message }
  }
}

/** Délai de rattrapage d'une tâche quotidienne manquée (serveur arrêté à l'heure prévue). */
export const CATCH_UP_MINUTES = 120
const DAILY_LOCK_TTL_MS = 3 * DAY_MS
const WEEKLY_LOCK_TTL_MS = 14 * DAY_MS

/** Vrai si l'heure de Paris est dans [heure prévue, heure prévue + rattrapage). */
function isDue(minutesOfDay: number, target: number): boolean {
  return minutesOfDay >= target && minutesOfDay < target + CATCH_UP_MINUTES
}

/**
 * Exécute `task` une seule fois pour l'occurrence `period` (jour ou semaine de
 * Paris), toutes instances et redémarrages confondus. Rend `true` si cette
 * exécution a pris le verrou. Une erreur levée libère le verrou (l'occurrence
 * sera retentée au passage suivant) ; une erreur rendue par la tâche (déjà
 * journalisée) le conserve : des e-mails ont pu partir.
 */
export async function runOnce(
  task: string,
  period: string,
  ttlMs: number,
  fn: () => Promise<unknown>,
  now: Date = new Date(),
): Promise<boolean> {
  const key = `crm-scheduler:${task}:${period}`
  if (!(await acquireSchedulerLock(key, ttlMs, now))) return false
  try {
    await fn()
  } catch (err) {
    await releaseSchedulerLock(key).catch(() => {})
    throw err
  }
  return true
}

/**
 * Passage du planificateur (chaque minute). Les heures sont celles de Paris ;
 * chaque tâche est protégée par un verrou en base (tâche + jour de Paris).
 */
export async function runScheduledJobs(now: Date = new Date()): Promise<void> {
  lastSchedulerRunAt = now.toISOString()
  const paris = parisParts(now)
  const today = paris.dateKey
  const thisWeek = parisWeekKey(now)
  const daily = (task: string, fn: () => Promise<unknown>) => runOnce(task, today, DAILY_LOCK_TTL_MS, fn, now)
  const weekly = (task: string, fn: () => Promise<unknown>) => runOnce(task, thisWeek, WEEKLY_LOCK_TTL_MS, fn, now)

  try {
    await processLeadFollowUps()
    // Règles à déclencheur « état » : une fois par jour de Paris, à partir de 09:00.
    // Idempotent aussi via la clé d'événement du jour.
    if (paris.hour >= 9) {
      await daily('crmRules', async () => {
        const { sweepRules } = await import('./crmRules.js')
        await sweepRules(now)
      })
    }
    const settings = await CrmSettings.getSettings()

    // Tâches quotidiennes à l'heure du rappel des retards (08:00 par défaut).
    if (isDue(paris.minutesOfDay, parseHHMM(settings.dailyOverdueEmailTime, '08:00'))) {
      const tasks: Array<[string, () => Promise<unknown>]> = [
        ['overdueActions', processOverdueActions],
        ['coldLeads', processColdLeads],
        ['escalation', () => processEscalations(now)],
        ['proposalReminder', processProposalReminders],
        ['overdueTasks', processOverdueTasks],
        ['taskReminders', processTaskDeadlineReminders],
        ['projectDeadlines', processProjectDeadlineAlerts],
        ['briefReminders', processBriefDeadlineReminders],
      ]
      for (const [task, fn] of tasks) {
        if (await daily(task, fn)) logger.info(`[CRM Scheduler] ${task} (${today})`)
      }
    }

    // Relances de factures à 09:00.
    if (isDue(paris.minutesOfDay, 9 * 60)) {
      if (await daily('invoiceReminders', processInvoiceReminders)) logger.info('[CRM Scheduler] invoiceReminders')
    }

    // Santé client : chaque semaine, le jour du rapport hebdomadaire, à 06:00.
    if (paris.weekday === settings.weeklyReportDay && isDue(paris.minutesOfDay, 6 * 60)) {
      if (await weekly('clientHealth', processClientHealthAutoUpdate)) logger.info('[CRM Scheduler] clientHealth')
    }

    // Rapport hebdomadaire : jour et heure configurés.
    if (
      paris.weekday === settings.weeklyReportDay &&
      isDue(paris.minutesOfDay, parseHHMM(settings.weeklyReportTime, '09:00'))
    ) {
      if (await weekly('weeklyReport', processWeeklyReport)) logger.info('[CRM Scheduler] weeklyReport')
    }
  } catch (err) {
    lastSchedulerFailureAt = new Date().toISOString()
    logger.error({ data: err }, '[CRM Scheduler] Error running scheduled jobs:')
  }
  await runCallPipelineJobs(now)
}

const CALL_SLOT_LOCK_TTL_MS = 15 * 60_000

/**
 * Chaîne du poste d'appel (enregistrement → transcript → analyse), en dernier
 * et à part : une panne d'un fournisseur ne retarde pas les tâches du CRM.
 * Balayages par créneau (une instance à la fois), purges une fois par jour à 03:00.
 * Chaque étape ne fait rien sans ses variables d'environnement.
 */
export async function runCallPipelineJobs(now: Date = new Date()): Promise<void> {
  const paris = parisParts(now)
  const slot = (minutes: number) => `${paris.dateKey}:${Math.floor(paris.minutesOfDay / minutes)}`
  const [{ closeStaleCalls, sweepRecordings }, transcription, analysis] = await Promise.all([
    import('./telephony/recording.js'),
    import('./transcription/index.js'),
    import('./callAnalysis/index.js'),
  ])
  // [tâche, occurrence, durée du verrou, travail]
  const tasks: Array<[string, string, number, () => Promise<unknown>]> = [
    ['callsStale', slot(1), CALL_SLOT_LOCK_TTL_MS, () => closeStaleCalls(now)],
    ['callRecordings', slot(1), CALL_SLOT_LOCK_TTL_MS, () => sweepRecordings(now)],
    ['callTranscripts', slot(1), CALL_SLOT_LOCK_TTL_MS, () => transcription.sweepTranscriptions(now)],
    ['callAnalyses', slot(5), CALL_SLOT_LOCK_TTL_MS, () => analysis.sweepAnalyses(now)],
    // Rapport hebdomadaire des scripts (lot K) : planifié le jour réglé, reprises et e-mails à chaque créneau.
    [
      'callScriptReports',
      slot(15),
      CALL_SLOT_LOCK_TTL_MS,
      async () => (await import('./callScriptReport/index.js')).runCallScriptReports(now),
    ],
  ]
  if (isDue(paris.minutesOfDay, 3 * 60)) {
    tasks.push(
      ['callTranscriptsPurge', paris.dateKey, DAILY_LOCK_TTL_MS, () => transcription.purgeTranscripts(now)],
      ['callAnalysesPurge', paris.dateKey, DAILY_LOCK_TTL_MS, () => analysis.purgeAnalyses(now)],
    )
  }
  for (const [task, period, ttlMs, fn] of tasks) {
    try {
      await runOnce(task, period, ttlMs, fn, now)
    } catch (err) {
      lastSchedulerFailureAt = new Date().toISOString()
      logger.error({ task, detail: (err as Error).message?.slice(0, 200) }, '[CRM Scheduler] poste d’appel')
    }
  }
}

/**
 * Start the scheduler (runs every minute)
 */
let schedulerInterval: ReturnType<typeof setInterval> | null = null
let lastSchedulerRunAt: string | null = null
let lastSchedulerFailureAt: string | null = null

export function startScheduler(): void {
  if (schedulerInterval) return
  logger.info('[CRM Scheduler] Starting scheduler...')
  schedulerInterval = setInterval(() => void runScheduledJobs(), 60 * 1000) // Every minute
  // Run once immediately
  void runScheduledJobs()
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    logger.info('[CRM Scheduler] Scheduler stopped')
  }
}

/** Minimal, secret-free runtime information for the admin health endpoint. */
export function getCrmSchedulerHealth(): {
  running: boolean
  lastRunAt: string | null
  lastFailureAt: string | null
} {
  return {
    running: schedulerInterval !== null,
    lastRunAt: lastSchedulerRunAt,
    lastFailureAt: lastSchedulerFailureAt,
  }
}
