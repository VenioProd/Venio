import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import type { AutomationDefinition } from '../automation/types.js'

/**
 * Durée de conservation (RGPD, chantier 3D) : la purge quotidienne
 * `crm.retention_purge` ne fait que compter tant que `retentionPurgeEnabled`
 * est faux ; activée, elle anonymise les leads non gagnés restés sans
 * interaction ni modification au-delà de `retentionMonths`.
 */

const registered: Record<string, AutomationDefinition> = {}
vi.mock('../automation/registry.js', () => ({
  registerAutomation: (d: AutomationDefinition) => {
    registered[d.key] = d
  },
}))

let Lead: typeof import('../models/Lead.js').default
let Interaction: typeof import('../models/Interaction.js').default
let CrmSettings: typeof import('../models/CrmSettings.js').default
let retention: typeof import('../lib/crmRetention.js')

const now = new Date('2026-11-06T03:00:00Z')
const old = new Date('2022-01-01T00:00:00Z') // > 36 mois avant `now`
const recent = new Date('2026-06-01T00:00:00Z')

async function insertLead(fields: Record<string, unknown>) {
  const doc = {
    company: 'Acme',
    contactName: 'Ana',
    contactEmail: 'ana@acme.test',
    contactPhone: '0601',
    notes: 'note',
    status: 'LOST',
    archivedAt: null,
    anonymizedAt: null,
    lastInteractionAt: null,
    lastContactAt: null,
    entity: 'VENIO',
    tags: [],
    createdAt: old,
    updatedAt: old,
    ...fields,
  }
  const { insertedId } = await Lead.collection.insertOne(doc)
  return insertedId
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  Interaction = (await import('../models/Interaction.js')).default
  CrmSettings = (await import('../models/CrmSettings.js')).default
  retention = await import('../lib/crmRetention.js')
  ;(await import('../automation/jobs/crmRetentionPurge.js')).register()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  await CrmSettings.create({ roundRobinEnabled: false, emailOnAssignment: false, activityLogging: true })
})

describe('purge de conservation', () => {
  it('bornes et date limite', () => {
    expect(retention.clampRetentionMonths(undefined)).toBe(36)
    expect(retention.clampRetentionMonths(2)).toBe(6)
    expect(retention.clampRetentionMonths(500)).toBe(120)
    expect(retention.retentionCutoff(new Date('2026-11-06T00:00:00Z'), 36).toISOString().slice(0, 10)).toBe(
      '2023-11-06',
    )
  })

  it('par défaut (non activée) : simulation, aucun lead modifié', async () => {
    const id = await insertLead({})
    const result = await retention.runRetentionPurge(now)
    expect(result).toMatchObject({ dryRun: true, retentionMonths: 36, eligible: 1, anonymized: 0 })
    const lead = await Lead.collection.findOne({ _id: id })
    expect(lead?.contactEmail).toBe('ana@acme.test')
    expect(lead?.anonymizedAt).toBeNull()
  })

  it('activée : anonymise les seuls leads éligibles', async () => {
    await CrmSettings.updateOne({}, { $set: { retentionPurgeEnabled: true } })
    const eligible = await insertLead({ company: 'Éligible' })
    const archived = await insertLead({ company: 'Archivé', archivedAt: old })
    const won = await insertLead({ company: 'Gagné', status: 'WON' })
    const touched = await insertLead({ company: 'Modifié récemment', updatedAt: recent })
    const interacted = await insertLead({ company: 'Échange récent (compteur)', lastInteractionAt: recent })
    const contacted = await insertLead({ company: 'Contact récent', lastContactAt: recent })
    const journal = await insertLead({ company: 'Échange récent (journal)' })
    await Interaction.collection.insertOne({
      subjectType: 'LEAD',
      subjectId: journal,
      kind: 'CALL',
      occurredAt: recent,
      body: 'appel',
    })

    const result = await retention.runRetentionPurge(now)
    expect(result).toMatchObject({ dryRun: false, eligible: 2, anonymized: 2, failed: 0 })

    for (const id of [eligible, archived]) {
      const lead = await Lead.collection.findOne({ _id: id })
      expect(lead).toMatchObject({
        contactName: 'Anonymisé (conservation)',
        contactEmail: '',
        contactPhone: '',
        notes: 'Anonymisé (conservation)',
      })
      expect(lead?.anonymizedAt).toBeInstanceOf(Date)
    }
    for (const id of [won, touched, interacted, contacted, journal]) {
      const lead = await Lead.collection.findOne({ _id: id })
      expect(lead?.contactEmail).toBe('ana@acme.test')
      expect(lead?.anonymizedAt).toBeNull()
    }
    // Un lead anonymisé n'est plus candidat.
    expect((await retention.runRetentionPurge(now)).eligible).toBe(0)
  })

  it('respecte la durée réglée', async () => {
    await CrmSettings.updateOne({}, { $set: { retentionMonths: 120 } })
    await insertLead({})
    expect((await retention.runRetentionPurge(now)).eligible).toBe(0)
  })

  it('job crm.retention_purge : 04:00 Paris, une seule exécution par jour (verrou SchedulerLock)', async () => {
    const job = registered['crm.retention_purge']
    expect(job).toBeDefined()
    expect(job.buildIdempotencyKey({ now } as never)).toBe('crm.retention_purge:2026-11-06')
    await insertLead({})
    const first = await job.execute({ now } as never)
    expect(first.details).toMatchObject({ dryRun: true, eligible: 1 })
    const second = await job.execute({ now } as never)
    expect(second.details).toEqual({ skipped: 'LOCKED' })
  })
})
