// Re-export all email functions so that existing imports like
// `import { sendWelcomeEmail } from '../../lib/email.js'` keep working.

export { sendAdminCredentials, sendTestEmail, sendPasswordResetEmail, sendWelcomeEmail } from './templates/auth.js'
export { sendInvoiceEmail, sendInvoiceReminderEmail } from './templates/billing.js'
export { sendClientProjectUpdateEmail, sendProjectStatusEmail, sendProjectStartEmail, sendProjectCompleteEmail, sendDeliverableNotificationEmail } from './templates/project.js'
export { sendTaskAssignedEmail, sendTaskReminderEmail } from './templates/task.js'
export { sendBriefAssignedEmail, sendBriefReminderEmail } from './templates/brief.js'
export { sendLeadAssignmentEmail, sendColdLeadsReminderEmail, sendOverdueActionsEmail, sendEscalationEmail, sendProposalReminderEmail } from './templates/crm.js'
export { sendWeeklyReportEmail } from './templates/report.js'
export { sendTicketReplyEmail } from './templates/ticket.js'
