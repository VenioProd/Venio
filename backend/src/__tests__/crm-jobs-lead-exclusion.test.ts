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
const { applyLeadChange } = vi.hoisted(() => ({ applyLeadChange: vi.fn(async (..._args: unknown[]) => ({})) }))
vi.mock('../lib/crmLeadService.js', () => ({ applyLeadChange }))
// Le job de relance de proposition lit son seuil dans CrmSettings : sans base ici.
vi.mock('../lib/crmProposalReminder.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProposalReminderDays: vi.fn(async () => 7),
}))

import { withActiveLeads, isLeadExcludedFromAutomation, ACTIVE_LEAD_FILTER } from '../automation/jobs/crmLeadScope.js'
import { register as regArchive } from '../automation/jobs/crmAutoArchiveLost.js'
import { register as regHot } from '../automation/jobs/crmHotLeadAlert.js'
import { register as regInactive } from '../automation/jobs/crmInactiveLeadFollowup.js'
import { register as regDemo } from '../automation/jobs/crmPostDemoFollowup.js'
import { register as regProposal } from '../automation/jobs/crmProposalFollowup.js'
import { register as regDrop } from '../automation/jobs/crmConversionDropAlert.js'

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
  for (const r of [regArchive, regHot, regInactive, regDemo, regProposal, regDrop]) r()
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

  it("crm.auto_archive_lost archive par le service unique (archivedAt, et non isArchived)", async () => {
    const lost = { _id: 'l-lost', status: 'LOST' }
    FakeLead.find.mockImplementationOnce(((q: Record<string, unknown>) => (queries.push(q), chain([lost]))) as never)
    const res = await registered['crm.auto_archive_lost'].execute(ctx())
    expect(FakeLead.find.mock.calls[0][0]).toMatchObject({ status: 'LOST', archivedAt: null, automationPausedAt: null })
    expect(FakeLead.updateMany).not.toHaveBeenCalled()
    expect(applyLeadChange).toHaveBeenCalledWith(lost, { archivedAt: now }, expect.objectContaining({ actor: null, source: 'scheduler' }))
    expect(res.details).toEqual({ archivedCount: 1 })
  })

  // crm.auto_convert_won_lead a été supprimé (chantier 2C) : la conversion d'un
  // lead gagné passe uniquement par processWonLead, appelé par applyLeadChange.
  it("crm.auto_convert_won_lead n'est plus enregistré", () => {
    expect(registered['crm.auto_convert_won_lead']).toBeUndefined()
  })
})
