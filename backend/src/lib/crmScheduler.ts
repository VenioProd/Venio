import Lead from '../models/Lead.js'
import Task from '../models/Task.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import BillingDocument from '../models/BillingDocument.js'
import Project from '../models/Project.js'
import MissionBrief from '../models/MissionBrief.js'
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
  sendInvoiceReminderEmail,
  sendTaskReminderEmail,
  sendBriefReminderEmail,
} from './email.js'
import logger from './logger.js'

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

// Track last run times to avoid duplicate runs
const lastRunTimes: Record<string, string | null> = {
  coldLeads: null,
  overdueActions: null,
  escalation: null,
  proposalReminder: null,
  weeklyReport: null,
  overdueTasks: null,
  invoiceReminders: null,
  taskReminders: null,
  projectDeadlines: null,
  briefReminders: null,
  clientHealth: null,
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
    const manager = settings.escalationManagerId ? await User.findById(settings.escalationManagerId) : null

    for (const lead of staleLeads) {
      const daysSinceUpdate = getDaysSinceUpdate(lead)
      const assignedTo = lead.assignedTo as unknown as {
        _id?: { toString(): string }
        name?: string
        email?: string
      } | null

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
            null,
          )
        }
      }

      escalated++
    }

    return { processed: staleLeads.length, escalated }
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

      const amountStr = `${invoice.total.toLocaleString('fr-FR')} ${invoice.currency}`
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

/**
 * Run all scheduled jobs (call this from a cron job or interval)
 */
export async function runScheduledJobs(): Promise<void> {
  lastSchedulerRunAt = new Date().toISOString()
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0 = Sunday

  try {
    const settings = await CrmSettings.getSettings()

    // Daily jobs at 08:00 (CRM + task/brief/project reminders)
    const [dailyHour, dailyMinute] = (settings.dailyOverdueEmailTime || '08:00').split(':').map(Number)
    if (currentHour === dailyHour && currentMinute >= dailyMinute && currentMinute < dailyMinute + 5) {
      // Check if already run today
      const today = now.toDateString()
      if (lastRunTimes.overdueActions !== today) {
        logger.info('[CRM Scheduler] Running daily overdue actions job...')
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

      // Task deadline reminders (08:00)
      if (lastRunTimes.taskReminders !== today) {
        logger.info('[CRM Scheduler] Running task deadline reminders...')
        await processTaskDeadlineReminders()
        lastRunTimes.taskReminders = today
      }

      // Project deadline alerts (08:00)
      if (lastRunTimes.projectDeadlines !== today) {
        logger.info('[CRM Scheduler] Running project deadline alerts...')
        await processProjectDeadlineAlerts()
        lastRunTimes.projectDeadlines = today
      }

      // Brief deadline reminders (08:00)
      if (lastRunTimes.briefReminders !== today) {
        logger.info('[CRM Scheduler] Running brief deadline reminders...')
        await processBriefDeadlineReminders()
        lastRunTimes.briefReminders = today
      }
    }

    // Invoice reminders at 09:00
    if (currentHour === 9 && currentMinute >= 0 && currentMinute < 5) {
      const today = now.toDateString()
      if (lastRunTimes.invoiceReminders !== today) {
        logger.info('[CRM Scheduler] Running invoice reminders...')
        await processInvoiceReminders()
        lastRunTimes.invoiceReminders = today
      }
    }

    // Client health auto-update (weekly, same day as weekly report)
    if (currentDay === settings.weeklyReportDay && currentHour === 6 && currentMinute >= 0 && currentMinute < 5) {
      const thisWeek = `${now.getFullYear()}-W${Math.ceil((now.getDate() + 6 - currentDay) / 7)}`
      if (lastRunTimes.clientHealth !== thisWeek) {
        logger.info('[CRM Scheduler] Running client health auto-update...')
        await processClientHealthAutoUpdate()
        lastRunTimes.clientHealth = thisWeek
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
        logger.info('[CRM Scheduler] Running weekly report job...')
        await processWeeklyReport()
        lastRunTimes.weeklyReport = thisWeek
      }
    }
  } catch (err) {
    lastSchedulerFailureAt = new Date().toISOString()
    logger.error({ data: err }, '[CRM Scheduler] Error running scheduled jobs:')
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
  schedulerInterval = setInterval(runScheduledJobs, 60 * 1000) // Every minute
  // Run once immediately
  runScheduledJobs()
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
