import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import type { AutomationDefinition } from '../automation/types.js'

const registered: Record<string, AutomationDefinition> = {}
vi.mock('../automation/registry.js', () => ({
  registerAutomation: (d: AutomationDefinition) => {
    registered[d.key] = d
  },
}))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn() }))
vi.mock('../lib/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { withActiveLeads, isLeadExcludedFromAutomation, ACTIVE_LEAD_FILTER } from '../automation/jobs/crmLeadScope.js'
import { register as regArchive } from '../automation/jobs/crmAutoArchiveLost.js'
import { register as regHot } from '../automation/jobs/crmHotLeadAlert.js'
import { register as regInactive } from '../automation/jobs/crmInactiveLeadFollowup.js'
import { register as regDemo } from '../automation/jobs/crmPostDemoFollowup.js'
import { register as regProposal } from '../automation/jobs/crmProposalFollowup.js'
import { register as regDrop } from '../automation/jobs/crmConversionDropAlert.js'
import { register as regConvert } from '../automation/jobs/crmAutoConvert.js'

const queries: Array<Record<string, unknown>> = []
const chain = (result: unknown[]) => {
  const p: any = Promise.resolve(result)
  p.populate = () => p
  return p
}
const FakeLead = {
  find: vi.fn((q: Record<string, unknown>) => (queries.push(q), chain([]))),
  countDocuments: vi.fn(async (q: Record<string, unknown>) => (queries.push(q), 0)),
  updateMany: vi.fn(async (q: Record<string, unknown>, _u?: unknown) => (queries.push(q), { modifiedCount: 0 })),
  findById: vi.fn(),
}
const FakeUser = { find: vi.fn(() => ({ select: async () => [] })), findOne: vi.fn(async () => null) }

const now = new Date('2026-11-06T10:00:00Z')
const ctx = (meta?: Record<string, unknown>) => ({ now, dateKey: '2026-11-06', meta, settings: { config: {} } }) as never

beforeEach(() => {
  queries.length = 0
  vi.clearAllMocks()
  vi.spyOn(mongoose, 'model').mockImplementation(((name: string) => (name === 'Lead' ? FakeLead : FakeUser)) as never)
  for (const r of [regArchive, regHot, regInactive, regDemo, regProposal, regDrop, regConvert]) r()
})

describe('crmLeadScope', () => {
  it('withActiveLeads ajoute les deux exclusions sans muter le filtre', () => {
    const base = { status: 'LOST' }
    const out = withActiveLeads(base)
    expect(out).toEqual({ status: 'LOST', archivedAt: null, automationPausedAt: null })
    expect(base).toEqual({ status: 'LOST' })
    expect(ACTIVE_LEAD_FILTER).toEqual({ archivedAt: null, automationPausedAt: null })
  })
  it('withActiveLeads écrase une tentative de réinclusion', () => {
    expect(withActiveLeads({ archivedAt: { $ne: null } }).archivedAt).toBeNull()
  })
  it('isLeadExcludedFromAutomation', () => {
    expect(isLeadExcludedFromAutomation({ archivedAt: new Date() })).toBe(true)
    expect(isLeadExcludedFromAutomation({ automationPausedAt: new Date() })).toBe(true)
    expect(isLeadExcludedFromAutomation({ archivedAt: null, automationPausedAt: null })).toBe(false)
    expect(isLeadExcludedFromAutomation({})).toBe(false)
    expect(isLeadExcludedFromAutomation(null)).toBe(false)
  })
})

describe('tâches CRM : exclusion des leads archivés / en pause', () => {
  it.each([
    'crm.hot_lead_untreated_alert',
    'crm.inactive_lead_followup',
    'crm.post_demo_followup',
    'crm.proposal_followup',
    'crm.conversion_drop_alert',
    'crm.auto_archive_lost',
  ])('%s filtre archivedAt et automationPausedAt sans utiliser isArchived', async (key) => {
    const def = registered[key]
    expect(def, key).toBeDefined()
    await def.execute(ctx())
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      expect(q.archivedAt).toBeNull()
      expect(q.automationPausedAt).toBeNull()
      expect(q).not.toHaveProperty('isArchived')
    }
  })

  it("crm.auto_archive_lost pose archivedAt (et non isArchived)", async () => {
    await registered['crm.auto_archive_lost'].execute(ctx())
    const update = FakeLead.updateMany.mock.calls[0][1] as { $set: Record<string, unknown> }
    expect(update.$set).toEqual({ archivedAt: now })
    expect(FakeLead.updateMany.mock.calls[0][0]).toMatchObject({ status: 'LOST', archivedAt: null, automationPausedAt: null })
  })

  it.each([
    ['archivé', { archivedAt: new Date() }],
    ['en pause', { automationPausedAt: new Date() }],
  ])('crm.auto_convert ignore un lead %s', async (_l, flags) => {
    FakeLead.findById.mockResolvedValue({ _id: 'l1', contactEmail: 'a@b.fr', ...flags })
    const res = await registered['crm.auto_convert_won_lead'].execute(ctx({ leadId: 'l1', newStatus: 'WON' }))
    expect(res.actionsExecuted).toEqual(['skipped:lead_archived_or_paused'])
    expect(FakeUser.findOne).not.toHaveBeenCalled()
  })
})
