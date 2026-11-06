import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import CrmSettings from '../models/CrmSettings.js'
import CrmRule from '../models/CrmRule.js'
import Interaction from '../models/Interaction.js'
import PersonalTask from '../models/PersonalTask.js'
import {
  applyLeadChange,
  createLead,
  deleteLeadCascade,
  isLeadChangeError,
  normalizeLeadPatch,
  type LeadChangeError,
} from '../lib/crmLeadService.js'
import { processWonLead } from '../lib/crmClientConversion.js'
import { fireLeadEvent, SEED_RULES } from '../lib/crmRules.js'

/** Laisse aux tâches lancées en arrière-plan (événements, notifications) le temps de finir. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

async function statusChanges(leadId: unknown) {
  return LeadActivity.find({ leadId, type: 'STATUS_CHANGE' }).sort({ createdAt: 1, _id: 1 }).lean()
}

async function expectLeadError(promise: Promise<unknown>, code: string): Promise<LeadChangeError> {
  try {
    await promise
  } catch (err) {
    expect(isLeadChangeError(err)).toBe(true)
    expect((err as LeadChangeError).code).toBe(code)
    return err as LeadChangeError
  }
  throw new Error(`attendu : LeadChangeError ${code}`)
}

describe('crmLeadService / normalisation', () => {
  it('ne garde que les champs connus et valides', () => {
    const patch = normalizeLeadPatch({ company: '  Acme ', status: 'NOPE', priority: 'HAUTE', budget: 'abc', foo: 1, lostReason: ' Prix ' })
    expect(patch).toMatchObject({ company: 'Acme', priority: 'HAUTE', budget: null, lostReason: 'Prix' })
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('foo')
  })

  it('rend null un assigné mal formé en mode souple (API agent)', () => {
    expect(normalizeLeadPatch({ assignedTo: 'pas-un-id' }, { lenientAssignee: true }).assignedTo).toBeNull()
    expect(normalizeLeadPatch({ assignedTo: 'pas-un-id' }).assignedTo).toBe('pas-un-id')
  })
})

describe('crmLeadService / applyLeadChange', () => {
  let actorId: string
  let colleagueId: string

  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(async () => {
    await clearDb()
    const actor = await User.create({ email: 'actor@test.local', name: 'Actor', role: 'SUPER_ADMIN', passwordHash: 'x' })
    const colleague = await User.create({ email: 'colleague@test.local', name: 'Colleague', role: 'COMMERCIAL', passwordHash: 'x' })
    actorId = String(actor._id)
    colleagueId = String(colleague._id)
  })

  it('consigne chaque changement de statut et met à jour statusChangedAt', async () => {
    const { lead } = await createLead({ company: 'Acme', createdBy: actorId }, { actor: actorId, source: 'admin' })
    const createdAt = lead.statusChangedAt!.getTime()
    await new Promise((r) => setTimeout(r, 5))

    const result = await applyLeadChange(String(lead._id), { status: 'CONTACTED' }, { actor: actorId, source: 'agent' })
    expect(result.transitions).toEqual([{ from: 'LEAD', to: 'CONTACTED', auto: false }])
    expect(result.lead.statusChangedAt!.getTime()).toBeGreaterThan(createdAt)
    // Automatisation de statut : la date de dernier contact est posée.
    expect(result.lead.lastContactAt).toBeInstanceOf(Date)

    const changes = await statusChanges(lead._id)
    expect(changes).toHaveLength(1)
    expect(changes[0].payload).toMatchObject({ from: 'LEAD', to: 'CONTACTED', source: 'agent' })

    // Sans changement de statut, rien n'est consigné.
    await applyLeadChange(lead, { notes: 'rien' }, { actor: actorId, source: 'admin' })
    expect(await statusChanges(lead._id)).toHaveLength(1)
  })

  it('consigne l’auto-qualification comme un changement de statut, à la création comme à la modification', async () => {
    const created = await createLead({ company: 'Qualifiée', budget: 5000, source: 'Referral' }, { actor: actorId, source: 'admin' })
    expect(created.lead.status).toBe('QUALIFIED')
    const first = await statusChanges(created.lead._id)
    expect(first).toHaveLength(1)
    expect(first[0].payload).toMatchObject({ from: 'LEAD', to: 'QUALIFIED', auto: 'AUTO_QUALIFIED' })

    const { lead } = await createLead({ company: 'Plus tard', source: 'Ads' }, { actor: actorId, source: 'admin' })
    expect(lead.status).toBe('LEAD')
    const updated = await applyLeadChange(lead, { budget: 2000 }, { actor: actorId, source: 'admin' })
    expect(updated.lead.status).toBe('QUALIFIED')
    expect(await statusChanges(lead._id)).toHaveLength(1)
  })

  it('n’auto-qualifie pas depuis une action groupée ni une règle', async () => {
    const { lead } = await createLead({ company: 'Groupée', source: 'Ads', status: 'CONTACTED', budget: 2000 }, { actor: actorId, source: 'admin' })
    const result = await applyLeadChange(lead, { status: 'LEAD' }, { actor: actorId, source: 'bulk' })
    expect(result.lead.status).toBe('LEAD')
  })

  it('refuse un motif de perte hors liste, sans rien écrire', async () => {
    const { lead } = await createLead({ company: 'Perdue' }, { actor: actorId, source: 'admin' })
    const err = await expectLeadError(
      applyLeadChange(lead, { status: 'LOST', lostReason: 'Inventé' }, { actor: actorId, source: 'admin' }),
      'INVALID_LOST_REASON',
    )
    expect(err.status).toBe(400)
    expect(err.details.allowed).toContain('Prix')
    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh!.status).toBe('LEAD')
    expect(await statusChanges(lead._id)).toHaveLength(0)

    const ok = await applyLeadChange(String(lead._id), { status: 'LOST', lostReason: 'Prix' }, { actor: actorId, source: 'admin' })
    expect(ok.lead.lostReason).toBe('Prix')
  })

  it('refuse un assigné inactif ou hors équipe, accepte un commercial actif', async () => {
    const client = await User.create({ email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' })
    const inactive = await User.create({ email: 'old@test.local', name: 'Old', role: 'COMMERCIAL', passwordHash: 'x', isActive: false })
    const { lead } = await createLead({ company: 'Assignation' }, { actor: actorId, source: 'admin' })

    await expectLeadError(applyLeadChange(lead, { assignedTo: String(client._id) }, { actor: actorId, source: 'admin' }), 'INVALID_ASSIGNEE')
    await expectLeadError(applyLeadChange(lead, { assignedTo: String(inactive._id) }, { actor: actorId, source: 'admin' }), 'INVALID_ASSIGNEE')
    expect((await Lead.findById(lead._id).lean())!.assignedTo).toBeNull()

    const result = await applyLeadChange(lead, { assignedTo: colleagueId }, { actor: actorId, source: 'admin' })
    expect(result.assigneeChanged).toBe(true)
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'ASSIGNED' })).toBe(1)
    // Désassigner n'est pas soumis au contrôle.
    await applyLeadChange(lead, { assignedTo: null }, { actor: actorId, source: 'admin' })
  })

  it('applique les automatisations de statut et recalcule le score', async () => {
    await CrmSettings.updateSettings({ scoringEnabled: true } as any)
    const { lead } = await createLead({ company: 'Score', contactEmail: 'a@b.fr' }, { actor: actorId, source: 'admin' })
    const scoreBefore = lead.score
    const result = await applyLeadChange(lead, { status: 'PROPOSAL', priority: 'URGENTE' }, { actor: actorId, source: 'bulk' })
    expect(result.lead.nextActionAt).toBeInstanceOf(Date)
    expect(result.lead.score).toBeGreaterThan(scoreBefore ?? 0)

    const closed = await applyLeadChange(lead, { status: 'LOST' }, { actor: actorId, source: 'bulk' })
    expect(closed.lead.nextActionAt).toBeNull()
  })

  it('convertit un lead gagné une seule fois, même par des chemins concurrents', async () => {
    const { lead } = await createLead(
      { company: 'Gagnée', contactEmail: 'won@client.fr', contactName: 'Won', status: 'PROPOSAL' },
      { actor: actorId, source: 'admin' },
    )
    const id = String(lead._id)
    // Quatre passages simultanés à WON : fiche, agent, action groupée, règle.
    const sources = ['admin', 'agent', 'bulk', 'rule'] as const
    const results = await Promise.allSettled(
      sources.map(async (source) => applyLeadChange(await Lead.findById(id), { status: 'WON' }, { actor: actorId, source })),
    )
    // Plus une conversion directe, comme celle d'une règle CREATE_CLIENT.
    await processWonLead(await Lead.findById(id), actorId)
    await settle()

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)
    const processed = results.filter((r) => r.status === 'fulfilled' && r.value.won?.processed)
    expect(processed).toHaveLength(1)
    expect(await User.countDocuments({ role: 'CLIENT' })).toBe(1)
    expect(await Project.countDocuments({ sourceLead: lead._id })).toBe(1)
    const fresh = await Lead.findById(id).lean()
    expect(fresh!.clientAccountId).not.toBeNull()
    expect((fresh as any).wonProcessedAt).toBeInstanceOf(Date)
  })

  it('ne recrée rien quand un lead repasse à WON', async () => {
    const { lead } = await createLead({ company: 'Yo-yo', contactEmail: 'yoyo@client.fr', status: 'WON' }, { actor: actorId, source: 'admin' })
    expect(await Project.countDocuments({ sourceLead: lead._id })).toBe(1)

    await applyLeadChange(lead, { status: 'LOST' }, { actor: actorId, source: 'admin' })
    const again = await applyLeadChange(lead, { status: 'WON' }, { actor: actorId, source: 'admin' })
    expect(again.won?.processed).toBe(false)
    expect(await User.countDocuments({ role: 'CLIENT' })).toBe(1)
    expect(await Project.countDocuments({ sourceLead: lead._id })).toBe(1)
    expect((await statusChanges(lead._id)).map((a) => a.payload.to)).toEqual(['LOST', 'WON'])
  })

  it('reprend sans doublon un lead gagné converti avant l’existence du verrou', async () => {
    const { lead } = await createLead({ company: 'Historique', contactEmail: 'old@client.fr', status: 'WON' }, { actor: actorId, source: 'admin' })
    // Lead gagné avant ce chantier : pas de verrou en base.
    await Lead.updateOne({ _id: lead._id }, { $unset: { wonProcessedAt: 1 } }, { strict: false })
    const outcome = await processWonLead(await Lead.findById(lead._id), actorId)
    expect(outcome.processed).toBe(true)
    expect(await User.countDocuments({ role: 'CLIENT' })).toBe(1)
    expect(await Project.countDocuments({ sourceLead: lead._id })).toBe(1)
  })

  it('une règle SET_STATUS passe par le service (historique et conversion)', async () => {
    await CrmRule.create({
      name: 'Gagner à la création',
      trigger: { type: 'LEAD_CREATED', params: {} },
      conditions: { op: 'AND', items: [] },
      actions: [{ type: 'SET_STATUS', params: { status: 'WON' } }],
      status: 'ACTIVE',
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    })
    const { lead } = await createLead({ company: 'Par règle', contactEmail: 'rule@client.fr' }, { actor: actorId, source: 'admin', emit: false })
    await fireLeadEvent(lead._id, { type: 'LEAD_CREATED', key: 'created' })

    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh!.status).toBe('WON')
    const changes = await statusChanges(lead._id)
    expect(changes).toHaveLength(1)
    expect(changes[0].payload).toMatchObject({ from: 'LEAD', to: 'WON', source: 'rule' })
    expect(changes[0].payload.ruleId).toBeTruthy()
    expect(await Project.countDocuments({ sourceLead: lead._id })).toBe(1)
  })

  it('lève NOT_FOUND pour un identifiant inconnu', async () => {
    await expectLeadError(applyLeadChange('64b000000000000000000000', { notes: 'x' }, { actor: null, source: 'agent' }), 'NOT_FOUND')
  })

  it('supprime le lead avec son historique, ses échanges et ses tâches', async () => {
    const { lead } = await createLead({ company: 'À supprimer' }, { actor: actorId, source: 'admin' })
    await Interaction.create({ subjectType: 'LEAD', subjectId: lead._id, kind: 'NOTE', body: 'note', author: actorId })
    await PersonalTask.create({ userId: actorId, title: 'Relancer', leadId: lead._id })
    await deleteLeadCascade(lead)
    expect(await Lead.countDocuments({ _id: lead._id })).toBe(0)
    expect(await LeadActivity.countDocuments({ leadId: lead._id })).toBe(0)
    expect(await Interaction.countDocuments({ subjectId: lead._id })).toBe(0)
    expect(await PersonalTask.countDocuments({ leadId: lead._id })).toBe(0)
  })
})

describe('crmRules / règle formulaire', () => {
  it('reconnaît la source écrite par le formulaire public', () => {
    const rule = SEED_RULES.find((r) => r.systemKey === 'nouveau-lead-formulaire')!
    const sourceCondition = rule.conditions!.items.find((c) => c.field === 'source')!
    expect(sourceCondition.value).toContain('FORMULAIRE_SITE')
  })
})
