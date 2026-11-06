import { describe, it, expect, vi, beforeEach } from 'vitest'

const queries: Array<{ fn: string; q: Record<string, unknown> }> = []
const settings = {
  coldLeadEmailEnabled: true, coldLeadThresholdDays: 7, dailyOverdueEmailEnabled: true,
  escalationEnabled: true, escalationThresholdDays: 7, escalationManagerId: null,
  proposalReminderDays: 5, proposalReminderEnabled: true, weeklyReportEnabled: true,
  weeklyReportRecipients: ['a@example.test'], escalationAction: 'NOTIFY_MANAGER',
}
const chain = (result: unknown[]) => {
  const p: any = Promise.resolve(result)
  p.populate = () => p
  p.select = () => p
  return p
}

vi.mock('../models/Lead.js', () => ({
  default: {
    find: vi.fn((q: Record<string, unknown>) => (queries.push({ fn: 'find', q }), chain([]))),
    countDocuments: vi.fn(async (q: Record<string, unknown>) => (queries.push({ fn: 'count', q }), 0)),
    updateOne: vi.fn(async (q: Record<string, unknown>) => (queries.push({ fn: 'updateOne', q }), { modifiedCount: 1 })),
  },
}))
vi.mock('../models/LeadActivity.js', () => ({ default: { countDocuments: vi.fn(async () => 0) } }))
vi.mock('../models/Task.js', () => ({ default: {} }))
vi.mock('../models/User.js', () => ({ default: { find: vi.fn(() => chain([])), findById: vi.fn(async () => null) } }))
vi.mock('../models/CrmSettings.js', () => ({ default: { getSettings: vi.fn(async () => settings) } }))
vi.mock('../models/BillingDocument.js', () => ({ default: {} }))
vi.mock('../models/Project.js', () => ({ default: {} }))
vi.mock('../models/MissionBrief.js', () => ({ default: {} }))
vi.mock('../lib/crmAutomations.js', () => ({
  getDaysSinceContact: vi.fn(), getDaysOverdue: vi.fn(), getDaysSinceStatusChange: vi.fn(),
  getDaysSinceUpdate: vi.fn(), getRoundRobinAssignee: vi.fn(), logLeadActivity: vi.fn(),
}))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn() }))
vi.mock('../lib/email.js', () => ({
  sendColdLeadsReminderEmail: vi.fn(), sendOverdueActionsEmail: vi.fn(), sendEscalationEmail: vi.fn(),
  sendProposalReminderEmail: vi.fn(), sendWeeklyReportEmail: vi.fn(), sendInvoiceReminderEmail: vi.fn(),
  sendTaskReminderEmail: vi.fn(), sendBriefReminderEmail: vi.fn(),
}))
vi.mock('../lib/projectFinance/payments.js', () => ({ invoicePaymentBalance: vi.fn() }))
// Aucune règle active : les tâches ne s'abstiennent pas (abstention testée dans crm-automation-unify.test.ts).
vi.mock('../lib/crmRules.js', () => ({
  isCoveredByActiveRule: vi.fn(async () => false),
  SYSTEM_RULE_FOR: { proposalFollowUp: 'proposition-sans-reponse', inactiveLeadFollowUp: 'relance-7j' },
}))
vi.mock('../lib/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  processColdLeads, processOverdueActions, processEscalations,
  processProposalReminders, processWeeklyReport,
} from '../lib/crmScheduler.js'

beforeEach(() => {
  queries.length = 0
})

describe('crmScheduler : requêtes Lead sans leads archivés ni en pause', () => {
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['processColdLeads', processColdLeads],
    ['processOverdueActions', processOverdueActions],
    ['processEscalations', processEscalations],
    ['processProposalReminders', processProposalReminders],
    ['processWeeklyReport', processWeeklyReport],
  ]
  it.each(cases)('%s', async (_n, run) => {
    await run()
    expect(queries.length).toBeGreaterThan(0)
    for (const { q } of queries) {
      expect(q.archivedAt).toBeNull()
      expect(q.automationPausedAt).toBeNull()
    }
  })
})
