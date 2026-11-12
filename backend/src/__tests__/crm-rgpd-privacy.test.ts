import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Interaction from '../models/Interaction.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import CrmSettings from '../models/CrmSettings.js'
import {
  addSuppression,
  anonymizeLead,
  applyUnsubscribe,
  backfillLeadPrivacy,
  buildPersonalDataExport,
  buildUnsubscribeUrl,
  checkProspectContact,
  normalizePrivacyPatch,
  preparePrivacyChange,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../lib/crmPrivacy.js'
import { applyLeadChange } from '../lib/crmLeadService.js'

/** Minimum RGPD du CRM (chantier 3D) : jetons, opposition, anonymisation, migration 010. */

describe('lien de désinscription — jeton signé', () => {
  const leadId = '64b000000000000000000001'

  it('un jeton valide rend le lead et l’adresse normalisée', () => {
    const token = signUnsubscribeToken({ leadId, email: ' Ana@Example.TEST ' })
    expect(verifyUnsubscribeToken(token)).toEqual({ ok: true, leadId, email: 'ana@example.test' })
  })

  it('une signature altérée, un contenu modifié ou un format faux sont refusés', () => {
    const token = signUnsubscribeToken({ leadId, email: 'ana@example.test' })
    const [body, sig] = token.split('.')
    const forgedBody = Buffer.from(JSON.stringify({ l: leadId, e: 'autre@example.test', x: 9999999999 })).toString(
      'base64url',
    )
    expect(verifyUnsubscribeToken(`${body}.${sig.slice(0, -2)}xx`)).toEqual({ ok: false, reason: 'INVALID' })
    expect(verifyUnsubscribeToken(`${forgedBody}.${sig}`)).toEqual({ ok: false, reason: 'INVALID' })
    expect(verifyUnsubscribeToken('pas-un-jeton')).toEqual({ ok: false, reason: 'INVALID' })
    expect(verifyUnsubscribeToken(undefined)).toEqual({ ok: false, reason: 'INVALID' })
    expect(verifyUnsubscribeToken(`${token}.extra`)).toEqual({ ok: false, reason: 'INVALID' })
  })

  it('un jeton expiré est refusé comme tel', () => {
    const issued = new Date('2025-01-01T00:00:00Z')
    const token = signUnsubscribeToken({ leadId, email: 'ana@example.test' }, issued, 30)
    expect(verifyUnsubscribeToken(token, new Date('2025-01-20T00:00:00Z')).ok).toBe(true)
    expect(verifyUnsubscribeToken(token, new Date('2025-03-01T00:00:00Z'))).toEqual({ ok: false, reason: 'EXPIRED' })
  })

  it('un jeton signé avec un autre secret ne vaut rien', () => {
    const previous = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'secret-a'
    const token = signUnsubscribeToken({ leadId, email: 'ana@example.test' })
    process.env.JWT_SECRET = 'secret-b'
    expect(verifyUnsubscribeToken(token)).toEqual({ ok: false, reason: 'INVALID' })
    process.env.JWT_SECRET = previous
    if (previous === undefined) delete process.env.JWT_SECRET
  })

  it('l’URL pointe vers la route publique avec le jeton encodé', () => {
    const url = buildUnsubscribeUrl(leadId, 'ana@example.test')
    expect(url).toMatch(/\/api\/public\/unsubscribe\?token=[A-Za-z0-9_\-.%]+$/)
    const token = decodeURIComponent(url.split('token=')[1])
    expect(verifyUnsubscribeToken(token).ok).toBe(true)
  })
})

describe('patch RGPD — normalisation et préparation', () => {
  it('ne garde que les valeurs connues', () => {
    expect(normalizePrivacyPatch({ doNotContact: 'oui', consent: { status: 'PEUT-ÊTRE', basis: 'CONTRACT' } })).toEqual(
      { consent: { basis: 'CONTRACT' } },
    )
    expect(normalizePrivacyPatch({ doNotContact: true, doNotContactReason: '  Appel  ' })).toEqual({
      doNotContact: true,
      doNotContactReason: 'Appel',
    })
    expect(normalizePrivacyPatch({})).toEqual({})
  })

  it('date l’opposition, la levée et le changement de consentement, et ignore ce qui ne change pas', () => {
    const now = new Date('2026-11-06T10:00:00Z')
    const patch: Record<string, any> = { doNotContact: true, consent: { status: 'WITHDRAWN' } }
    const events = preparePrivacyChange(
      { doNotContact: false, consent: { status: 'GRANTED', basis: 'CONSENT', source: 'admin', at: null } },
      patch,
      'admin',
      now,
    )
    expect(patch.doNotContactAt).toEqual(now)
    expect(patch.doNotContactReason).toBe('MANUAL')
    expect(patch.consent).toEqual({ status: 'WITHDRAWN', basis: 'CONSENT', source: 'admin', at: now })
    expect(events.map((e) => e.type)).toEqual(['CONSENT_CHANGED', 'DO_NOT_CONTACT'])

    const same: Record<string, any> = { doNotContact: true, consent: { status: 'GRANTED' } }
    expect(
      preparePrivacyChange({ doNotContact: true, consent: { status: 'GRANTED', basis: 'CONSENT' } }, same, 'admin'),
    ).toEqual([])
    expect(same).toEqual({})

    const lift: Record<string, any> = { doNotContact: false }
    expect(preparePrivacyChange({ doNotContact: true }, lift, 'admin').map((e) => e.type)).toEqual([
      'DO_NOT_CONTACT_LIFTED',
    ])
    expect(lift.doNotContactAt).toBeNull()
  })
})

describe('RGPD — base de données', () => {
  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(async () => {
    await clearDb()
    await CrmSettings.create({ roundRobinEnabled: false, emailOnAssignment: false, activityLogging: true })
  })

  it('un nouveau lead porte la base légale par défaut (intérêt légitime) et aucune opposition', async () => {
    const lead = await Lead.create({ company: 'Acme' })
    expect(lead.consent).toMatchObject({ status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST' })
    expect(lead.doNotContact).toBe(false)
    expect(lead.anonymizedAt).toBeNull()
  })

  it('l’opposition posée par le service est datée et journalisée', async () => {
    const lead = await Lead.create({ company: 'Acme', contactEmail: 'ana@acme.test' })
    await applyLeadChange(lead, { doNotContact: true }, { actor: null, source: 'admin' })
    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh?.doNotContact).toBe(true)
    expect(fresh?.doNotContactAt).toBeInstanceOf(Date)
    expect(await LeadActivity.exists({ leadId: lead._id, type: 'DO_NOT_CONTACT' })).toBeTruthy()
  })

  it('checkProspectContact bloque par la fiche ou par la liste de suppression (insensible à la casse)', async () => {
    expect(await checkProspectContact({ doNotContact: true, contactEmail: 'a@x.test' })).toEqual({
      allowed: false,
      reason: 'DO_NOT_CONTACT',
      via: 'LEAD',
    })
    expect((await checkProspectContact({ doNotContact: false, contactEmail: 'b@x.test' })).allowed).toBe(true)
    await addSuppression('B@X.test ', { reason: 'MANUAL' })
    expect(await checkProspectContact({ doNotContact: false, contactEmail: 'b@x.test' })).toEqual({
      allowed: false,
      reason: 'DO_NOT_CONTACT',
      via: 'SUPPRESSION_LIST',
    })
    // Idempotent : une seconde inscription ne crée rien et garde la raison d'origine.
    expect(await addSuppression('b@x.test', { reason: 'UNSUBSCRIBE' })).toBe(false)
    expect(await SuppressionEntry.countDocuments()).toBe(1)
    expect((await SuppressionEntry.findOne().lean())?.reason).toBe('MANUAL')
  })

  it('la désinscription pose l’opposition sur le lead et inscrit l’adresse ; elle est idempotente', async () => {
    const lead = await Lead.create({ company: 'Acme', contactEmail: 'Ana@Acme.test' })
    const first = await applyUnsubscribe(String(lead._id), 'ana@acme.test')
    const second = await applyUnsubscribe(String(lead._id), 'ana@acme.test')
    expect(first).toEqual({ leadFound: true, alreadySuppressed: false })
    expect(second).toEqual({ leadFound: true, alreadySuppressed: true })
    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh?.doNotContact).toBe(true)
    expect(fresh?.doNotContactReason).toBe('UNSUBSCRIBE_LINK')
    expect(await SuppressionEntry.countDocuments({ emailNormalized: 'ana@acme.test', reason: 'UNSUBSCRIBE' })).toBe(1)
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'DO_NOT_CONTACT' })).toBe(1)
  })

  it('l’anonymisation vide les coordonnées, neutralise les échanges et l’historique, et garde l’opposition', async () => {
    const lead = await Lead.create({
      company: 'Acme',
      contactName: 'Ana Dupont',
      contactEmail: 'ana@acme.test',
      contactPhone: '0601020304',
      notes: 'Rappeler Ana le soir',
      interactionNotes: 'Ancienne note',
      status: 'LOST',
      doNotContact: true,
    })
    await Interaction.create({
      subjectType: 'LEAD',
      subjectId: lead._id,
      kind: 'EMAIL',
      direction: 'OUT',
      subject: 'Votre projet',
      body: 'Bonjour Ana',
      recipients: [{ email: 'ana@acme.test', name: 'Ana', status: 'SENT' }],
    })
    await LeadActivity.create({
      leadId: lead._id,
      type: 'CONTACT_FORM_SUBMITTED',
      label: 'x',
      payload: { message: 'Je suis Ana', source: 'FORMULAIRE_SITE' },
    })

    expect(await anonymizeLead(lead, { actor: null, source: 'admin', reason: 'REQUEST' })).toEqual({ anonymized: true })
    const fresh = await Lead.findById(lead._id).lean()
    expect(fresh).toMatchObject({
      contactName: 'Anonymisé (demande)',
      contactEmail: '',
      contactPhone: '',
      notes: 'Anonymisé (demande)',
      interactionNotes: '',
      company: 'Acme',
      status: 'LOST',
    })
    expect(fresh?.anonymizedAt).toBeInstanceOf(Date)
    const interaction = await Interaction.findOne({ subjectId: lead._id }).lean()
    expect(interaction?.body).toBe('Anonymisé (demande)')
    expect(interaction?.subject).toBe('')
    expect(interaction?.recipients[0].email).toBe('anonymise@anonymise.invalid')
    const form = await LeadActivity.findOne({ leadId: lead._id, type: 'CONTACT_FORM_SUBMITTED' }).lean()
    expect(form?.payload).toEqual({ source: 'FORMULAIRE_SITE' })
    expect(await LeadActivity.exists({ leadId: lead._id, type: 'ANONYMIZED' })).toBeTruthy()
    // L'opposition survit : l'adresse reste reconnue.
    expect(await SuppressionEntry.exists({ emailNormalized: 'ana@acme.test' })).toBeTruthy()
    // Une seconde anonymisation ne fait rien.
    expect(
      await anonymizeLead((await Lead.findById(lead._id))!, { actor: null, source: 'admin', reason: 'REQUEST' }),
    ).toEqual({ anonymized: false })
  })

  it('l’export des données personnelles rassemble le lead, l’historique et les échanges', async () => {
    const lead = await Lead.create({ company: 'Acme', contactEmail: 'ana@acme.test' })
    await LeadActivity.create({ leadId: lead._id, type: 'CREATED', label: 'Lead créé', payload: {} })
    await Interaction.create({ subjectType: 'LEAD', subjectId: lead._id, kind: 'CALL', body: 'Appel' })
    await addSuppression('ana@acme.test', { reason: 'MANUAL' })
    const data = await buildPersonalDataExport(lead._id)
    expect(data?.format).toBe('venio-crm-personal-data/v1')
    expect(String(data?.lead._id)).toBe(String(lead._id))
    expect(data?.activities).toHaveLength(1)
    expect(data?.interactions).toHaveLength(1)
    expect(data?.suppression?.emailNormalized).toBe('ana@acme.test')
  })

  it('migration 010 : base par défaut pour l’existant, sans rien écraser ni toucher updatedAt ; idempotente ; dry-run', async () => {
    const old = new Date('2020-01-01T00:00:00Z')
    await Lead.collection.insertMany([
      { company: 'Sans consentement', status: 'LEAD', updatedAt: old, createdAt: old },
      {
        company: 'Base contractuelle',
        status: 'LEAD',
        consent: { status: 'GRANTED', basis: 'CONTRACT' },
        doNotContact: true,
        updatedAt: old,
        createdAt: old,
      },
      { company: 'Base vide', status: 'LEAD', consent: { status: 'GRANTED' }, updatedAt: old, createdAt: old },
    ])
    const dry = await backfillLeadPrivacy(true)
    expect(dry).toMatchObject({ dryRun: true, missingConsent: 1, missingBasis: 1, missingDoNotContact: 2, modified: 0 })
    expect(await Lead.collection.countDocuments({ consent: { $exists: true } })).toBe(2)

    const run = await backfillLeadPrivacy(false)
    expect(run.modified).toBeGreaterThan(0)
    const rows = await Lead.collection.find({}).sort({ company: 1 }).toArray()
    const byName = Object.fromEntries(rows.map((r) => [r.company, r]))
    expect(byName['Sans consentement'].consent).toMatchObject({ status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST' })
    expect(byName['Base contractuelle'].consent).toEqual({ status: 'GRANTED', basis: 'CONTRACT' })
    expect(byName['Base contractuelle'].doNotContact).toBe(true)
    expect(byName['Base vide'].consent).toEqual({ status: 'GRANTED', basis: 'LEGITIMATE_INTEREST' })
    for (const r of rows) expect(r.updatedAt).toEqual(old)

    const again = await backfillLeadPrivacy(false)
    expect(again).toMatchObject({
      missingConsent: 0,
      missingBasis: 0,
      missingStatus: 0,
      missingDoNotContact: 0,
      modified: 0,
    })
  })
})
