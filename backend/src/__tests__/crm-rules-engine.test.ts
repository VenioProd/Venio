import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmRule from '../models/CrmRule.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import {
  csvCell,
} from '../routes/crmExtras.js'
import {
  evaluateConditions,
  fireLeadEvent,
  matchesTrigger,
  renderTemplate,
  seedCrmRules,
  simulateRule,
  sweepRules,
  rejectRun,
} from '../lib/crmRules.js'

describe('crmRules / fonctions pures', () => {
  const lead = { status: 'PROPOSAL', budget: 20000, tags: ['Santé'], source: 'Site web', assignedTo: null, statusChangedAt: new Date(Date.now() - 6 * 864e5), createdAt: new Date(Date.now() - 20 * 864e5) }

  it('évalue ET / OU et les opérateurs', () => {
    expect(evaluateConditions({ op: 'AND', items: [{ field: 'status', operator: 'in', value: ['PROPOSAL', 'DEMO'] }, { field: 'budget', operator: 'gte', value: 10000 }] }, lead)).toBe(true)
    expect(evaluateConditions({ op: 'AND', items: [{ field: 'budget', operator: 'lt', value: 100 }, { field: 'status', operator: 'eq', value: 'PROPOSAL' }] }, lead)).toBe(false)
    expect(evaluateConditions({ op: 'OR', items: [{ field: 'budget', operator: 'lt', value: 100 }, { field: 'tags', operator: 'contains', value: 'santé' }] }, lead)).toBe(true)
    expect(evaluateConditions({ op: 'AND', items: [{ field: 'assignedTo', operator: 'empty' }, { field: 'daysInStage', operator: 'gte', value: 5 }] }, lead)).toBe(true)
    expect(evaluateConditions({ op: 'AND', items: [] }, lead)).toBe(true)
  })

  it('filtre le déclencheur de changement de statut', () => {
    const rule = { trigger: { type: 'STATUS_CHANGED', params: { to: ['WON'] } } } as any
    expect(matchesTrigger(rule, { type: 'STATUS_CHANGED', key: 'k', to: 'WON' })).toBe(true)
    expect(matchesTrigger(rule, { type: 'STATUS_CHANGED', key: 'k', to: 'LOST' })).toBe(false)
    expect(matchesTrigger(rule, { type: 'LEAD_CREATED', key: 'k' })).toBe(false)
  })

  it('rend les gabarits et neutralise les formules CSV', () => {
    expect(renderTemplate('Relancer {contact} ({company})', { contactName: 'Ada', company: 'Acme' })).toBe('Relancer Ada (Acme)')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('a;b')).toBe('"a;b"')
  })
})

describe('crmRules / moteur', () => {
  let ownerId: string

  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(async () => {
    await clearDb()
    const owner = await User.create({ email: 'o@test.local', name: 'Owner', role: 'COMMERCIAL', passwordHash: 'x' })
    ownerId = String(owner._id)
  })

  const taskRule = (extra: Record<string, unknown> = {}) =>
    CrmRule.create({
      name: 'Relance',
      status: 'ACTIVE',
      trigger: { type: 'STATUS_CHANGED', params: { to: ['PROPOSAL'] } },
      actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1 } }],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
      ...extra,
    })

  it('crée une tâche sur changement de statut, une seule fois par événement', async () => {
    const rule = await taskRule()
    const lead = await Lead.create({ company: 'Acme', contactName: 'Ada', status: 'PROPOSAL', assignedTo: ownerId })
    const event = { type: 'STATUS_CHANGED' as const, key: 'status:PROPOSAL:1', from: 'DEMO', to: 'PROPOSAL' }
    await fireLeadEvent(lead._id, event)
    await fireLeadEvent(lead._id, event)
    const tasks = await PersonalTask.find({ leadId: lead._id })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Relancer Ada')
    expect(String(tasks[0].ruleId)).toBe(String(rule._id))
    expect(await CrmRuleRun.countDocuments({ status: 'OK' })).toBe(1)
  })

  it('applique la limite par lead et journalise l’exécution ignorée', async () => {
    await taskRule()
    const lead = await Lead.create({ company: 'Acme', status: 'PROPOSAL', assignedTo: ownerId })
    await fireLeadEvent(lead._id, { type: 'STATUS_CHANGED', key: 'a', to: 'PROPOSAL' })
    await PersonalTask.deleteMany({})
    await fireLeadEvent(lead._id, { type: 'STATUS_CHANGED', key: 'b', to: 'PROPOSAL' })
    expect(await PersonalTask.countDocuments()).toBe(0)
    expect(await CrmRuleRun.countDocuments({ status: 'SKIP' })).toBe(1)
  })

  it('ignore une règle brouillon et un lead dont les automatisations sont suspendues', async () => {
    await taskRule({ status: 'DRAFT' })
    const lead = await Lead.create({ company: 'Acme', status: 'PROPOSAL', assignedTo: ownerId })
    await fireLeadEvent(lead._id, { type: 'STATUS_CHANGED', key: 'a', to: 'PROPOSAL' })
    await CrmRule.updateMany({}, { status: 'ACTIVE' })
    await Lead.updateOne({ _id: lead._id }, { automationPausedAt: new Date() })
    await fireLeadEvent(lead._id, { type: 'STATUS_CHANGED', key: 'b', to: 'PROPOSAL' })
    expect(await CrmRuleRun.countDocuments()).toBe(0)
  })

  it('n’entre pas en boucle : une règle qui change le statut ne se rappelle pas elle-même', async () => {
    await CrmRule.create({
      name: 'Boucle',
      status: 'ACTIVE',
      trigger: { type: 'STATUS_CHANGED', params: {} },
      actions: [{ type: 'SET_STATUS', params: { status: 'DEMO' } }],
      limits: { perLead: 'NONE', days: 1, maxPerRun: 50 },
    })
    const lead = await Lead.create({ company: 'Acme', status: 'LEAD', assignedTo: ownerId })
    lead.status = 'QUALIFIED'
    await lead.save()
    await fireLeadEvent(lead._id, { type: 'STATUS_CHANGED', key: 'start', from: 'LEAD', to: 'QUALIFIED' })
    expect((await Lead.findById(lead._id))!.status).toBe('DEMO')
    expect(await CrmRuleRun.countDocuments({ status: { $ne: 'SIM' } })).toBe(1)
  })

  it('met un e-mail en attente de validation puis le refuse sans envoi', async () => {
    await CrmRule.create({
      name: 'Mail',
      status: 'ACTIVE',
      requireApproval: true,
      trigger: { type: 'LEAD_CREATED', params: {} },
      actions: [{ type: 'SEND_EMAIL', params: { subject: 'Bonjour', body: 'Salut {contact}' } }],
    })
    const lead = await Lead.create({ company: 'Acme', contactName: 'Ada', contactEmail: 'ada@acme.test', assignedTo: ownerId })
    await fireLeadEvent(lead._id, { type: 'LEAD_CREATED', key: 'created' })
    const run = await CrmRuleRun.findOne()
    expect(run!.status).toBe('PENDING')
    expect(run!.steps[0].payload).toMatchObject({ to: 'ada@acme.test', body: 'Salut Ada' })
    const rejected = await rejectRun(String(run!._id))
    expect(rejected!.status).toBe('SKIP')
    expect(rejected!.steps[0].payload).toBeUndefined()
  })

  it('le balayage relance les leads inactifs depuis N jours, sans doublon le même jour', async () => {
    await CrmRule.create({
      name: 'Inactifs',
      status: 'ACTIVE',
      trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED'] } },
      actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {company}' } }],
      limits: { perLead: 'DAYS', days: 7, maxPerRun: 50 },
    })
    const old = new Date(Date.now() - 10 * 864e5)
    const stale = await Lead.create({ company: 'Vieux', status: 'CONTACTED', assignedTo: ownerId, lastContactAt: old, statusChangedAt: old })
    await Lead.collection.updateOne({ _id: stale._id }, { $set: { createdAt: old } })
    await Lead.create({ company: 'Frais', status: 'CONTACTED', assignedTo: ownerId, lastContactAt: new Date() })
    expect((await sweepRules()).runs).toBe(1)
    expect((await sweepRules()).runs).toBe(0)
    const tasks = await PersonalTask.find()
    expect(tasks.map((t) => t.title)).toEqual(['Relancer Vieux'])
  })

  it('simule sans effet de bord et sème des brouillons', async () => {
    const rule = await taskRule()
    await Lead.create({ company: 'Acme', status: 'PROPOSAL', assignedTo: ownerId })
    const sim = await simulateRule(rule, { record: true })
    expect(sim.total).toBe(1)
    expect(await PersonalTask.countDocuments()).toBe(0)
    expect(await CrmRuleRun.countDocuments({ status: 'SIM' })).toBe(1)
    expect(await seedCrmRules()).toBeGreaterThanOrEqual(6)
    expect(await seedCrmRules()).toBe(0)
    expect(await CrmRule.countDocuments({ systemKey: { $exists: true }, status: 'ACTIVE' })).toBe(0)
  })
})

describe('Lead / probabilité', () => {
  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(clearDb)

  it('prend la valeur par défaut de l’étape puis la suit, sauf choix manuel', async () => {
    const lead = await Lead.create({ company: 'Acme', status: 'DEMO' })
    expect(lead.probability).toBe(50)
    lead.status = 'PROPOSAL'
    await lead.save()
    expect(lead.probability).toBe(65)
    lead.status = 'WON'
    lead.probability = 90
    await lead.save()
    expect(lead.probability).toBe(90)
  })
})
