import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

/**
 * RGPD et règles CRM (chantier 3D) : blocage des e-mails de prospection
 * (opposition, liste de suppression), lien de désinscription, et actions de
 * règles qui passent désormais par le service unique (ASSIGN, SET_FIELD,
 * ADD_TAG, ARCHIVE) sans casser l'anti-boucle.
 */

const mail = vi.hoisted(() => ({ calls: [] as Array<Record<string, any>> }))
vi.mock('../lib/email/send.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendBulkEmail: vi.fn(async (input: { recipients: Array<{ email: string; name?: string }> }) => {
    mail.calls.push(input)
    const results = input.recipients.map((r) => ({ email: r.email, name: r.name ?? '', success: true }))
    return { results, sent: results.length, failed: 0, total: results.length }
  }),
}))
vi.mock('../lib/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createNotification: vi.fn(async () => null),
}))

let Lead: typeof import('../models/Lead.js').default
let User: typeof import('../models/User.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let CrmRule: typeof import('../models/CrmRule.js').default
let CrmRuleRun: typeof import('../models/CrmRuleRun.js').default
let CrmSettings: typeof import('../models/CrmSettings.js').default
let rules: typeof import('../lib/crmRules.js')
let privacy: typeof import('../lib/crmPrivacy.js')
let ownerId: string

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  User = (await import('../models/User.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  CrmRule = (await import('../models/CrmRule.js')).default
  CrmRuleRun = (await import('../models/CrmRuleRun.js')).default
  CrmSettings = (await import('../models/CrmSettings.js')).default
  rules = await import('../lib/crmRules.js')
  privacy = await import('../lib/crmPrivacy.js')
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  mail.calls.length = 0
  await CrmSettings.create({ roundRobinEnabled: false, emailOnAssignment: false, activityLogging: true, scoringEnabled: false })
  const owner = await User.create({ email: 'owner@rgpd.test', name: 'Owner', role: 'COMMERCIAL', passwordHash: 'x' })
  ownerId = String(owner._id)
})

const activeRule = (actions: Array<{ type: string; params?: Record<string, unknown> }>, extra: Record<string, unknown> = {}) =>
  CrmRule.create({
    name: `Règle ${Math.random().toString(36).slice(2, 7)}`,
    status: 'ACTIVE',
    trigger: { type: 'LEAD_CREATED', params: {} },
    conditions: { op: 'AND', items: [] },
    actions,
    limits: { perLead: 'NONE', days: 7, maxPerRun: 50 },
    requireApproval: false,
    ...extra,
  })

const fire = (leadId: unknown, key = 'created') => rules.fireLeadEvent(String(leadId), { type: 'LEAD_CREATED', key })
const emailAction = { type: 'SEND_EMAIL', params: { subject: 'Bonjour {contact}', body: 'Message' } }

describe('SEND_EMAIL — opposition et liste de suppression', () => {
  it('envoie avec un lien de désinscription signé quand rien ne s’y oppose', async () => {
    await activeRule([emailAction])
    const lead = await Lead.create({ company: 'Acme', contactName: 'Ana', contactEmail: 'ana@acme.test' })
    await fire(lead._id)
    expect(mail.calls).toHaveLength(1)
    const url = String(mail.calls[0].unsubscribeUrl)
    expect(url).toContain('/api/public/unsubscribe?token=')
    const check = privacy.verifyUnsubscribeToken(decodeURIComponent(url.split('token=')[1]))
    expect(check).toEqual({ ok: true, leadId: String(lead._id), email: 'ana@acme.test' })
    expect((await CrmRuleRun.findOne().lean())?.status).toBe('OK')
  })

  it('n’envoie rien à un lead qui s’est opposé : exécution SKIP, raison DO_NOT_CONTACT', async () => {
    await activeRule([emailAction])
    const lead = await Lead.create({ company: 'Acme', contactEmail: 'ana@acme.test', doNotContact: true })
    await fire(lead._id)
    expect(mail.calls).toHaveLength(0)
    const run = await CrmRuleRun.findOne().lean()
    expect(run?.status).toBe('SKIP')
    expect(run?.steps[0]).toMatchObject({ action: 'SEND_EMAIL', status: 'SKIP', payload: { reason: 'DO_NOT_CONTACT', via: 'LEAD' } })
  })

  it('n’envoie rien à une adresse de la liste de suppression, même portée par un autre lead', async () => {
    await activeRule([emailAction])
    await privacy.addSuppression('ANA@acme.test', { reason: 'UNSUBSCRIBE' })
    const lead = await Lead.create({ company: 'Acme bis', contactEmail: 'ana@acme.test' })
    await fire(lead._id)
    expect(mail.calls).toHaveLength(0)
    expect((await CrmRuleRun.findOne().lean())?.steps[0]).toMatchObject({ status: 'SKIP', payload: { reason: 'DO_NOT_CONTACT', via: 'SUPPRESSION_LIST' } })
  })

  it('un e-mail en attente de validation ne part pas si la personne s’est désinscrite entre-temps', async () => {
    await activeRule([emailAction], { requireApproval: true })
    const lead = await Lead.create({ company: 'Acme', contactEmail: 'ana@acme.test' })
    await fire(lead._id)
    const pending = await CrmRuleRun.findOne()
    expect(pending?.status).toBe('PENDING')
    await privacy.applyUnsubscribe(String(lead._id), 'ana@acme.test')
    const run = await rules.approveRun(String(pending!._id), ownerId)
    expect(mail.calls).toHaveLength(0)
    expect(run?.status).toBe('SKIP')
    expect(run?.steps[0]).toMatchObject({ status: 'SKIP', payload: { reason: 'DO_NOT_CONTACT' } })
  })

  it('la simulation signale le blocage sans rien écrire', async () => {
    const rule = await activeRule([emailAction])
    await Lead.create({ company: 'Acme', contactEmail: 'ana@acme.test', doNotContact: true })
    const sim = await rules.simulateRule(rule, { record: true })
    expect(sim.total).toBe(1)
    expect((await CrmRuleRun.findOne({ status: 'SIM' }).lean())?.steps[0].message).toMatch(/DO_NOT_CONTACT/)
    expect(mail.calls).toHaveLength(0)
  })
})

describe('actions de règles via le service unique', () => {
  it('ASSIGN refuse un commercial inactif ou non habilité, et passe par le service pour un assigné valide', async () => {
    const inactive = await User.create({ email: 'off@rgpd.test', name: 'Off', role: 'COMMERCIAL', passwordHash: 'x', isActive: false })
    const compta = await User.create({ email: 'cpt@rgpd.test', name: 'Cpt', role: 'COMPTABLE', passwordHash: 'x' })
    for (const userId of [String(inactive._id), String(compta._id)]) {
      await clearRules()
      const rule = await activeRule([{ type: 'ASSIGN', params: { userId } }])
      const lead = await Lead.create({ company: `Acme ${userId}` })
      await fire(lead._id)
      expect((await Lead.findById(lead._id).lean())?.assignedTo).toBeNull()
      expect((await CrmRuleRun.findOne({ rule: rule._id }).lean())?.steps[0]).toMatchObject({ status: 'SKIP' })
    }

    await clearRules()
    const rule = await activeRule([{ type: 'ASSIGN', params: { userId: ownerId } }])
    const lead = await Lead.create({ company: 'Acme' })
    await fire(lead._id)
    expect(String((await Lead.findById(lead._id).lean())?.assignedTo)).toBe(ownerId)
    const activity = await LeadActivity.findOne({ leadId: lead._id, type: 'ASSIGNED' }).lean()
    expect(activity?.label).toContain('(règle)')
    expect(String((activity?.payload as { ruleId?: unknown }).ruleId)).toBe(String(rule._id))
  })

  it('SET_FIELD normalise la valeur comme la fiche et ignore une valeur refusée ou inchangée', async () => {
    await activeRule([{ type: 'SET_FIELD', params: { field: 'priority', value: 'EXTRÊME' } }])
    const lead = await Lead.create({ company: 'Acme' })
    await fire(lead._id)
    expect((await Lead.findById(lead._id).lean())?.priority).toBe('NORMALE')
    expect((await CrmRuleRun.findOne().lean())?.steps[0]).toMatchObject({ status: 'SKIP' })

    await clearRules()
    await activeRule([{ type: 'SET_FIELD', params: { field: 'probability', value: 250 } }])
    const other = await Lead.create({ company: 'Beta' })
    await fire(other._id)
    // Même borne que la fiche : 0–100.
    expect((await Lead.findById(other._id).lean())?.probability).toBe(100)
  })

  it('ADD_TAG et ARCHIVE passent par le service : historique avec la règle, aucun événement émis', async () => {
    const rule = await activeRule([{ type: 'ADD_TAG', params: { tag: 'rgpd' } }, { type: 'ARCHIVE' }])
    // Une règle à l'écoute d'une assignation ou d'un statut ne doit pas être réveillée par ces écritures.
    const listener = await activeRule([{ type: 'ADD_TAG', params: { tag: 'écho' } }], { trigger: { type: 'STATUS_CHANGED', params: {} } })
    const lead = await Lead.create({ company: 'Acme', tags: ['existant'] })
    await fire(lead._id)
    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh?.tags).toEqual(['existant', 'rgpd'])
    expect(fresh?.archivedAt).toBeInstanceOf(Date)
    const archived = await LeadActivity.findOne({ leadId: lead._id, type: 'ARCHIVED' }).lean()
    expect(archived?.label).toBe('Lead archivé (règle)')
    expect(String((archived?.payload as { ruleId?: unknown }).ruleId)).toBe(String(rule._id))
    await new Promise((r) => setTimeout(r, 50))
    expect(await CrmRuleRun.countDocuments({ rule: listener._id })).toBe(0)
  })

  it('anti-boucle : ASSIGN déclenche les règles « assigné » une fois, à la profondeur suivante', async () => {
    const assigner = await activeRule([{ type: 'ASSIGN', params: { userId: ownerId } }])
    const onAssigned = await activeRule([{ type: 'ADD_TAG', params: { tag: 'assigné' } }], { trigger: { type: 'LEAD_ASSIGNED', params: {} } })
    const lead = await Lead.create({ company: 'Acme' })
    await fire(lead._id)
    await new Promise((r) => setTimeout(r, 50))
    const runs = await CrmRuleRun.find({ rule: onAssigned._id }).lean()
    expect(runs).toHaveLength(1)
    expect(runs[0].depth).toBe(1)
    expect(await CrmRuleRun.countDocuments({ rule: assigner._id })).toBe(1)
    expect((await Lead.findById(lead._id).lean())?.tags).toEqual(['assigné'])
  })
})

async function clearRules() {
  await CrmRule.deleteMany({})
  await CrmRuleRun.deleteMany({})
}

describe('planificateur et jobs crm* : aucun e-mail vers un prospect', () => {
  // Garde-fou statique : ces tâches écrivent à l'équipe (commerciaux, managers) ou
  // aux clients (factures), jamais à l'adresse d'un lead. Si cela change, il faut
  // y ajouter checkProspectContact et le lien de désinscription.
  const here = path.dirname(fileURLToPath(import.meta.url))
  const files = [
    path.join(here, '../lib/crmScheduler.ts'),
    ...readdirSync(path.join(here, '../automation/jobs'))
      .filter((f) => /^crm.*\.ts$/.test(f))
      .map((f) => path.join(here, '../automation/jobs', f)),
  ]
  it.each(files.map((f) => [path.basename(f), f]))('%s n’adresse aucun e-mail à contactEmail', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toMatch(/to:\s*[\w.?]*contactEmail/)
    expect(source).not.toMatch(/sendBulkEmail/)
  })
})
