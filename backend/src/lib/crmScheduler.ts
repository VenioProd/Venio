import Lead from '../models/Lead.js'
import Task from '../models/Task.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import { ADMIN_ROLES } from './permissions.js'
import {
  getDaysSinceContact,
  getDaysOverdue,
  getDaysSinceStatusChange,
  getDaysSinceUpdate,
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
  sendTaskAssignedEmail,
} from './email.js'

interface SchedulerResult {
  processed: number
  sent: number
  error?: string
}

interface EscalationResult {
  processed: number
  escalated: number
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

// Track last run times to avoid duplicate runs
const lastRunTimes: Record<string, string | null> = {
  coldLeads: null,
  overdueActions: null,
  escalation: null,
  proposalReminder: null,
  weeklyReport: null,
  overdueTasks: null,
}

/**
 * Process cold leads and send reminder emails
 */
export async function processColdLeads(): Promise<SchedulerResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.coldLeadEmailEnabled) return { processed: 0, sent: 0 }

    const threshold = new Date()
    threshold.setDate(threshold.getDate() - settings.coldLeadThresholdDays)

    // Get cold leads grouped by assignee
    const coldLeads = await Lead.find({
      lastContactAt: { $lt: threshold },
      status: { $nin: ['WON', 'LOST'] },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'name email')

    // Group by assignee
    const byAssignee: Record<string, { assignee: { name: string; email: string }; leads: Array<{ company: string; contactName: string; daysSinceContact: number | null }> }> = {}
    for (const lead of coldLeads) {
      const assignedTo = lead.assignedTo as unknown as { _id: { toString(): string }; email?: string; name: string } | null
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
    console.error('Error processing cold leads:', err)
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
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
    const overdueLeads = await Lead.find({
      nextActionAt: { $lt: now },
      status: { $nin: ['WON', 'LOST'] },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'name email')

    // Group by assignee
    const byAssignee: Record<string, { assignee: { name: string; email: string }; leads: Array<{ company: string; contactName: string; nextActionAt: Date | string; daysOverdue: number }> }> = {}
    for (const lead of overdueLeads) {
      const assignedTo = lead.assignedTo as unknown as { _id: { toString(): string }; email?: string; name: string } | null
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
    console.error('Error processing overdue actions:', err)
    return { processed: 0, sent: 0, error: (err as Error).message }
  }
}

/**
 * Process escalations for inactive leads
 */
export async function processEscalations(): Promise<EscalationResult> {
  try {
    const settings = await CrmSettings.getSettings()
    if (!settings.escalationEnabled) return { processed: 0, escalated: 0 }

    const threshold = new Date()
    threshold.setDate(threshold.getDate() - settings.escalationThresholdDays)

    // Find leads that haven't been updated in X days
    const staleLeads = await Lead.find({
      updatedAt: { $lt: threshold },
      status: { $nin: ['WON', 'LOST'] },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'name email')

    let escalated = 0
    const manager = settings.escalationManagerId
      ? await User.findById(settings.escalationManagerId)
      : null

    for (const lead of staleLeads) {
      const daysSinceUpdate = getDaysSinceUpdate(lead)
      const assignedTo = lead.assignedTo as unknown as { _id?: { toString(): string }; name?: string; email?: string } | null

      if (settings.escalationAction === 'NOTIFY_MANAGER' || settings.escalationAction === 'BOTH') {
        if (manager?.email) {
          await sendEscalationEmail({
            to: manager.email,
            managerName: manager.name,
            lead,
            assigneeName: assignedTo?.name || 'Non assigné',
            daysSinceAssignment: daysSinceUpdate,
          })
        }
      }

      if (settings.escalationAction === 'REASSIGN' || settings.escalationAction === 'BOTH') {
        // Reassign to next admin in round-robin
        const newAssignee = await getRoundRobinAssignee()
        if (newAssignee && newAssignee.toString() !== assignedTo?._id?.toString()) {
          const oldAssignee = assignedTo?._id
          lead.assignedTo = newAssignee
          await lead.save()
          await logLeadActivity(
            lead._id.toString(),
            'ESCALATION_REASSIGN',
            `Lead réassigné automatiquement après ${daysSinceUpdate} jours d'inactivité`,
            { from: oldAssignee, to: newAssignee, days: daysSinceUpdate },
            null
          )
        }
      }

      escalated++
    }

    return { processed: staleLeads.length, escalated }
  } catch (err) {
    console.error('Error processing escalations:', err)
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

    const threshold = new Date()
    threshold.setDate(threshold.getDate() - settings.proposalReminderDays)

    // Find leads in PROPOSAL status for more than X days
    const proposalLeads = await Lead.find({
      status: 'PROPOSAL',
      statusChangedAt: { $lt: threshold },
      assignedTo: { $ne: null },
    }).populate('assignedTo', 'name email')

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
    console.error('Error processing proposal reminders:', err)
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

    const [newLeads, qualified, won, lost, allActive] = await Promise.all([
      Lead.countDocuments({ createdAt: { $gte: weekAgo } }),
      Lead.countDocuments({ status: 'QUALIFIED', statusChangedAt: { $gte: weekAgo } }),
      Lead.countDocuments({ status: 'WON', statusChangedAt: { $gte: weekAgo } }),
      Lead.countDocuments({ status: 'LOST', statusChangedAt: { $gte: weekAgo } }),
      Lead.find({ status: { $nin: ['WON', 'LOST'] } }),
    ])

    const totalActive = allActive.length
    const pipelineValue = allActive.reduce((sum, lead) => sum + (lead.budget || 0), 0)
    const conversionRate = newLeads > 0 ? Math.round((won / newLeads) * 100) : 0

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
    console.error('Error processing weekly report:', err)
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
    }).populate('assignee', 'name email').populate('project', 'name')

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
      }).catch(() => {})

      notified++
    }

    return { processed: overdueTasks.length, notified }
  } catch (err) {
    console.error('Error processing overdue tasks:', err)
    return { processed: 0, notified: 0, error: (err as Error).message }
  }
}

/**
 * Run all scheduled jobs (call this from a cron job or interval)
 */
export async function runScheduledJobs(): Promise<void> {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0 = Sunday

  try {
    const settings = await CrmSettings.getSettings()

    // Daily jobs (run at configured time)
    const [dailyHour, dailyMinute] = (settings.dailyOverdueEmailTime || '08:00').split(':').map(Number)
    if (currentHour === dailyHour && currentMinute >= dailyMinute && currentMinute < dailyMinute + 5) {
      // Check if already run today
      const today = now.toDateString()
      if (lastRunTimes.overdueActions !== today) {
        console.log('[CRM Scheduler] Running daily overdue actions job...')
        await processOverdueActions()
        await processColdLeads()
        await processEscalations()
        await processProposalReminders()
        await processOverdueTasks()
        lastRunTimes.overdueActions = today
        lastRunTimes.coldLeads = today
        lastRunTimes.escalation = today
        lastRunTimes.proposalReminder = today
        lastRunTimes.overdueTasks = today
      }
    }

    // Weekly report (run on configured day at configured time)
    const [weeklyHour, weeklyMinute] = (settings.weeklyReportTime || '09:00').split(':').map(Number)
    if (
      currentDay === settings.weeklyReportDay &&
      currentHour === weeklyHour &&
      currentMinute >= weeklyMinute &&
      currentMinute < weeklyMinute + 5
    ) {
      const thisWeek = `${now.getFullYear()}-W${Math.ceil((now.getDate() + 6 - currentDay) / 7)}`
      if (lastRunTimes.weeklyReport !== thisWeek) {
        console.log('[CRM Scheduler] Running weekly report job...')
        await processWeeklyReport()
        lastRunTimes.weeklyReport = thisWeek
      }
    }
  } catch (err) {
    console.error('[CRM Scheduler] Error running scheduled jobs:', err)
  }
}

/**
 * Start the scheduler (runs every minute)
 */
let schedulerInterval: ReturnType<typeof setInterval> | null = null

export function startScheduler(): void {
  if (schedulerInterval) return
  console.log('[CRM Scheduler] Starting scheduler...')
  schedulerInterval = setInterval(runScheduledJobs, 60 * 1000) // Every minute
  // Run once immediately
  runScheduledJobs()
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[CRM Scheduler] Scheduler stopped')
  }
}
