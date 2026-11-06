import crypto from 'crypto'
import type { Types } from 'mongoose'
import Lead, { CONSENT_STATUSES, LEGAL_BASES } from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Interaction from '../models/Interaction.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import SuppressionEntry, { type SuppressionReason } from '../models/SuppressionEntry.js'
import { logLeadActivity } from './crmAutomations.js'

/**
 * Minimum RGPD du CRM (chantier 3D) : opposition (« ne pas contacter »), liste
 * de suppression globale, lien de désinscription signé, anonymisation et
 * export des données d'un lead.
 *
 * Règle d'or : un e-mail de prospection ne part jamais vers une adresse dont
 * le lead porte `doNotContact` ou qui figure dans la liste de suppression.
 * Les envois concernés (règles, envoi manuel depuis la fiche) appellent
 * `checkProspectContact` juste avant d'envoyer.
 */

export const DO_NOT_CONTACT = 'DO_NOT_CONTACT'
/** Plafond de destinataires d'un envoi manuel depuis la fiche. */
export const MANUAL_EMAIL_MAX_RECIPIENTS = 10
export const ANONYMIZED_RETENTION_LABEL = 'Anonymisé (conservation)'
export const ANONYMIZED_REQUEST_LABEL = 'Anonymisé (demande)'
/** Adresse de remplacement dans le journal des échanges (le schéma exige une adresse). */
export const ANONYMIZED_EMAIL = 'anonymise@anonymise.invalid'
/** Durée de validité d'un lien de désinscription. */
export const UNSUBSCRIBE_TOKEN_TTL_DAYS = 365

type ConsentStatus = (typeof CONSENT_STATUSES)[number]
type LegalBasis = (typeof LEGAL_BASES)[number]
export interface LeadConsent {
  status: ConsentStatus
  basis: LegalBasis
  source: string
  at: Date | null
}
export const DEFAULT_CONSENT: LeadConsent = { status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST', source: '', at: null }

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

// ───────────────────────── Liste de suppression ─────────────────────────

/** Adresses (normalisées) de la liste qui figurent parmi `emails`. */
export async function suppressedAmong(emails: string[]): Promise<Set<string>> {
  const wanted = [...new Set(emails.map(normalizeEmail).filter(Boolean))]
  if (wanted.length === 0) return new Set()
  const rows = await SuppressionEntry.find({ emailNormalized: { $in: wanted } }).select('emailNormalized').lean()
  return new Set(rows.map((r) => r.emailNormalized))
}

export async function isEmailSuppressed(email: unknown): Promise<boolean> {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  return Boolean(await SuppressionEntry.exists({ emailNormalized: normalized }))
}

/** Inscrit une adresse (idempotent : une inscription existante garde sa raison et sa date). */
export async function addSuppression(
  email: unknown,
  opts: { reason: SuppressionReason; createdBy?: string | null; leadId?: Types.ObjectId | string | null },
): Promise<boolean> {
  const emailNormalized = normalizeEmail(email)
  if (!emailNormalized) return false
  const res = await SuppressionEntry.updateOne(
    { emailNormalized },
    { $setOnInsert: { emailNormalized, reason: opts.reason, createdBy: opts.createdBy ?? null, leadId: opts.leadId ?? null } },
    { upsert: true },
  )
  return res.upsertedCount > 0
}

export interface ContactCheck {
  allowed: boolean
  reason?: typeof DO_NOT_CONTACT
  /** `LEAD` : opposition posée sur la fiche ; `SUPPRESSION_LIST` : adresse inscrite dans la liste globale. */
  via?: 'LEAD' | 'SUPPRESSION_LIST'
}

/** Peut-on écrire à `email` (par défaut l'adresse du lead) dans le cadre de la prospection ? */
export async function checkProspectContact(
  lead: { doNotContact?: boolean | null; contactEmail?: string | null } | null,
  email?: string,
): Promise<ContactCheck> {
  if (lead?.doNotContact) return { allowed: false, reason: DO_NOT_CONTACT, via: 'LEAD' }
  const target = email ?? lead?.contactEmail ?? ''
  if (await isEmailSuppressed(target)) return { allowed: false, reason: DO_NOT_CONTACT, via: 'SUPPRESSION_LIST' }
  return { allowed: true }
}

// ───────────────────────── Lien de désinscription ─────────────────────────

/**
 * Clé de signature des liens. Même secret que le chiffrement des secrets en
 * base (`lib/secretBox.ts` : CREDENTIALS_KEY, sinon JWT_SECRET), dérivé pour cet
 * usage seul : un jeton de désinscription ne vaut rien ailleurs.
 */
function unsubscribeKey(): Buffer {
  let material = process.env.CREDENTIALS_KEY || process.env.JWT_SECRET || ''
  if (!material) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Secret de signature absent (CREDENTIALS_KEY ou JWT_SECRET) : lien de désinscription impossible')
    }
    material = 'venio-dev-fallback-key'
  }
  return crypto.createHmac('sha256', material).update('crm-unsubscribe:v1').digest()
}

const sign = (body: string) => crypto.createHmac('sha256', unsubscribeKey()).update(body).digest('base64url')

export function signUnsubscribeToken(
  input: { leadId: Types.ObjectId | string; email: string },
  now: Date = new Date(),
  ttlDays: number = UNSUBSCRIBE_TOKEN_TTL_DAYS,
): string {
  const payload = { l: String(input.leadId), e: normalizeEmail(input.email), x: Math.floor(now.getTime() / 1000) + ttlDays * 86400 }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export type UnsubscribeTokenCheck =
  | { ok: true; leadId: string; email: string }
  | { ok: false; reason: 'INVALID' | 'EXPIRED' }

export function verifyUnsubscribeToken(token: unknown, now: Date = new Date()): UnsubscribeTokenCheck {
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, reason: 'INVALID' }
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return { ok: false, reason: 'INVALID' }
  let expected: Buffer
  try {
    expected = Buffer.from(sign(body), 'utf8')
  } catch {
    return { ok: false, reason: 'INVALID' }
  }
  const provided = Buffer.from(signature, 'utf8')
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return { ok: false, reason: 'INVALID' }
  let payload: { l?: unknown; e?: unknown; x?: unknown }
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'INVALID' }
  }
  if (typeof payload.l !== 'string' || typeof payload.e !== 'string' || typeof payload.x !== 'number') return { ok: false, reason: 'INVALID' }
  if (payload.x * 1000 < now.getTime()) return { ok: false, reason: 'EXPIRED' }
  return { ok: true, leadId: payload.l, email: payload.e }
}

/** URL publique du lien de désinscription (le backend sert aussi le site : même origine). */
export function buildUnsubscribeUrl(leadId: Types.ObjectId | string, email: string, now: Date = new Date()): string {
  const base = (process.env.PUBLIC_APP_URL || process.env.APP_URL || 'https://venio.paris').replace(/\/+$/, '')
  return `${base}/api/public/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken({ leadId, email }, now))}`
}

/**
 * Désinscription par la personne : opposition sur le lead (via le service
 * unique) et inscription de l'adresse dans la liste globale. Idempotente.
 */
export async function applyUnsubscribe(leadId: string, email: string): Promise<{ leadFound: boolean; alreadySuppressed: boolean }> {
  const alreadySuppressed = !(await addSuppression(email, { reason: 'UNSUBSCRIBE', createdBy: null, leadId: isObjectIdLike(leadId) ? leadId : null }))
  const lead = isObjectIdLike(leadId) ? await Lead.findById(leadId) : null
  if (lead && !lead.doNotContact) {
    const { applyLeadChange } = await import('./crmLeadService.js')
    await applyLeadChange(
      lead,
      { doNotContact: true, doNotContactReason: 'UNSUBSCRIBE_LINK' },
      { actor: null, source: 'form', emit: false, validateAssignee: false, labelSuffix: '(lien de désinscription)' },
    )
  }
  return { leadFound: Boolean(lead), alreadySuppressed }
}

const isObjectIdLike = (v: string) => /^[a-f0-9]{24}$/i.test(v)

// ───────────────────────── Patch de la fiche ─────────────────────────

/** Champs RGPD acceptés dans un patch de lead (admin, agent). Les dates sont posées par le service. */
export function normalizePrivacyPatch(body: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = {}
  if (typeof body.doNotContact === 'boolean') out.doNotContact = body.doNotContact
  if (typeof body.doNotContactReason === 'string') out.doNotContactReason = body.doNotContactReason.trim().slice(0, 200)
  if (body.consent && typeof body.consent === 'object' && !Array.isArray(body.consent)) {
    const consent: Partial<LeadConsent> = {}
    if ((CONSENT_STATUSES as readonly string[]).includes(body.consent.status)) consent.status = body.consent.status
    if ((LEGAL_BASES as readonly string[]).includes(body.consent.basis)) consent.basis = body.consent.basis
    if (Object.keys(consent).length > 0) out.consent = consent
  }
  return out
}

export interface PrivacyEvent {
  type: string
  label: string
  payload: Record<string, unknown>
}

function plainConsent(value: unknown): LeadConsent {
  const raw = (value && typeof (value as { toObject?: () => unknown }).toObject === 'function'
    ? (value as { toObject: () => unknown }).toObject()
    : value) as Partial<LeadConsent> | null | undefined
  return { ...DEFAULT_CONSENT, ...(raw ?? {}) }
}

/**
 * Prépare la partie RGPD d'un patch (appelé par `applyLeadChange` avant
 * écriture) : fusionne le consentement avec l'existant et date le changement,
 * date l'opposition. Modifie `patch` et rend les événements à journaliser.
 */
export function preparePrivacyChange(
  existing: { consent?: unknown; doNotContact?: boolean | null } | null,
  patch: Record<string, any>,
  source: string,
  now: Date = new Date(),
): PrivacyEvent[] {
  const events: PrivacyEvent[] = []
  if (patch.consent !== undefined) {
    const prev = plainConsent(existing?.consent)
    const asked = (patch.consent ?? {}) as Partial<LeadConsent>
    const next: LeadConsent = { ...prev, ...asked }
    const changed = next.status !== prev.status || next.basis !== prev.basis
    if (existing && !changed) {
      delete patch.consent
    } else {
      next.source = asked.source || source
      next.at = asked.at ?? now
      patch.consent = next
      if (existing) {
        events.push({
          type: 'CONSENT_CHANGED',
          label: `Consentement : ${prev.status} → ${next.status} (base légale ${next.basis})`,
          payload: { from: { status: prev.status, basis: prev.basis }, to: { status: next.status, basis: next.basis }, source },
        })
      }
    }
  }
  if (patch.doNotContact !== undefined) {
    const was = Boolean(existing?.doNotContact)
    const wanted = Boolean(patch.doNotContact)
    if (existing && wanted === was) {
      delete patch.doNotContact
    } else if (wanted) {
      patch.doNotContactAt = now
      patch.doNotContactReason = patch.doNotContactReason || 'MANUAL'
      events.push({ type: 'DO_NOT_CONTACT', label: 'Opposition : ne plus contacter', payload: { reason: patch.doNotContactReason, source } })
    } else {
      patch.doNotContactAt = null
      events.push({ type: 'DO_NOT_CONTACT_LIFTED', label: 'Opposition levée sur la fiche', payload: { source } })
    }
  }
  return events
}

// ───────────────────────── Anonymisation ─────────────────────────

/** Clés de payload d'activité qui peuvent porter des données personnelles. */
export const PERSONAL_PAYLOAD_KEYS = [
  'message',
  'email',
  'contactEmail',
  'contactName',
  'contactPhone',
  'phone',
  'name',
  'firstName',
  'lastName',
  'qualification',
  'qualificationSummary',
  'to',
  'body',
  'notes',
] as const

/** Champs normalisés que d'autres chantiers peuvent ajouter au lead (doublons) : vidés s'ils existent. */
const NORMALIZED_CONTACT_FIELDS = ['contactEmailNormalized', 'contactPhoneNormalized', 'emailNormalized', 'phoneNormalized']

type LeadDoc = InstanceType<typeof Lead>

/**
 * Anonymise un lead (pas de suppression : les statistiques, devis et projets
 * restent). Vide les coordonnées et les notes, neutralise le journal des
 * échanges et retire les données personnelles des payloads d'historique.
 * L'opposition éventuelle survit : l'adresse passe dans la liste de suppression.
 */
export async function anonymizeLead(
  lead: LeadDoc,
  opts: { actor: string | null; source: 'admin' | 'scheduler'; reason: 'RETENTION' | 'REQUEST'; now?: Date },
): Promise<{ anonymized: boolean }> {
  if (lead.anonymizedAt) return { anonymized: false }
  const now = opts.now ?? new Date()
  const label = opts.reason === 'RETENTION' ? ANONYMIZED_RETENTION_LABEL : ANONYMIZED_REQUEST_LABEL
  const email = normalizeEmail(lead.contactEmail)
  if (email && (lead.doNotContact || (await isEmailSuppressed(email)))) {
    await addSuppression(email, { reason: 'OPPOSITION', createdBy: opts.actor, leadId: lead._id })
  }

  const patch: Record<string, any> = {
    contactName: label,
    contactEmail: '',
    contactPhone: '',
    notes: label,
    interactionNotes: '',
    lostComment: '',
    anonymizedAt: now,
  }
  for (const field of NORMALIZED_CONTACT_FIELDS) if (Lead.schema.path(field)) patch[field] = ''
  if (lead.closingHandoff?.repNotes) {
    const handoff = (lead.closingHandoff as unknown as { toObject?: () => Record<string, unknown> }).toObject?.() ?? { ...lead.closingHandoff }
    patch.closingHandoff = { ...handoff, repNotes: '' }
  }

  const { applyLeadChange } = await import('./crmLeadService.js')
  await applyLeadChange(lead, patch, { actor: opts.actor, source: opts.source, emit: false, validateAssignee: false })

  const filter = { subjectType: 'LEAD', subjectId: lead._id }
  await Interaction.updateMany(filter, { $set: { subject: '', body: label } })
  await Interaction.updateMany(
    { ...filter, 'recipients.0': { $exists: true } },
    { $set: { 'recipients.$[].email': ANONYMIZED_EMAIL, 'recipients.$[].name': '', 'recipients.$[].error': '' } },
  )
  await LeadActivity.updateMany(
    { leadId: lead._id },
    { $unset: Object.fromEntries(PERSONAL_PAYLOAD_KEYS.map((k) => [`payload.${k}`, ''])) },
  )
  // Les e-mails en attente de validation portent l'adresse et le texte : ils ne partiront plus.
  await CrmRuleRun.updateMany(
    { lead: lead._id, 'steps.0': { $exists: true } },
    { $unset: { 'steps.$[].payload': '' } },
  )
  await CrmRuleRun.updateMany({ lead: lead._id, status: 'PENDING' }, { $set: { status: 'SKIP' } })
  await logLeadActivity(lead._id, 'ANONYMIZED', label, { reason: opts.reason, source: opts.source }, opts.actor)
  return { anonymized: true }
}

// ───────────────────────── Export (droit d'accès) ─────────────────────────

/** Tout ce que le CRM détient sur la personne d'un lead, en JSON. */
export async function buildPersonalDataExport(leadId: Types.ObjectId | string) {
  const lead = await Lead.findById(leadId).lean()
  if (!lead) return null
  const email = normalizeEmail(lead.contactEmail)
  const [activities, interactions, tasks, ruleRuns, suppression] = await Promise.all([
    LeadActivity.find({ leadId: lead._id }).sort({ createdAt: 1, _id: 1 }).lean(),
    Interaction.find({ subjectType: 'LEAD', subjectId: lead._id }).sort({ occurredAt: 1, _id: 1 }).lean(),
    PersonalTask.find({ leadId: lead._id }).select('title status dueDate createdAt').sort({ createdAt: 1 }).lean(),
    CrmRuleRun.find({ lead: lead._id }).select('ruleName trigger status steps createdAt').sort({ createdAt: 1 }).lean(),
    email ? SuppressionEntry.findOne({ emailNormalized: email }).select('emailNormalized reason createdAt').lean() : null,
  ])
  return {
    format: 'venio-crm-personal-data/v1',
    exportedAt: new Date().toISOString(),
    lead,
    activities,
    interactions,
    tasks,
    ruleRuns,
    suppression: suppression ?? null,
  }
}

// ───────────────────────── Migration 010 ─────────────────────────

/**
 * Base légale par défaut des leads existants (intérêt légitime) et opposition
 * explicite à `false`. N'écrase rien : seuls les champs absents sont posés.
 * `updatedAt` n'est pas touché (la purge de conservation s'y fie).
 */
export async function backfillLeadPrivacy(dryRun = false) {
  const coll = Lead.collection
  const noConsent = { $or: [{ consent: { $exists: false } }, { consent: null }] }
  const noBasis = { consent: { $type: 'object' }, $or: [{ 'consent.basis': { $exists: false } }, { 'consent.basis': null }, { 'consent.basis': '' }] }
  const noStatus = { consent: { $type: 'object' }, $or: [{ 'consent.status': { $exists: false } }, { 'consent.status': null }, { 'consent.status': '' }] }
  const noDoNotContact = { doNotContact: { $exists: false } }
  const counts = {
    missingConsent: await coll.countDocuments(noConsent),
    missingBasis: await coll.countDocuments(noBasis),
    missingStatus: await coll.countDocuments(noStatus),
    missingDoNotContact: await coll.countDocuments(noDoNotContact),
  }
  if (dryRun) return { dryRun: true, ...counts, modified: 0 }
  let modified = 0
  modified += (await coll.updateMany(noConsent, { $set: { consent: { status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST', source: 'MIGRATION_010', at: null } } })).modifiedCount
  modified += (await coll.updateMany(noBasis, { $set: { 'consent.basis': 'LEGITIMATE_INTEREST' } })).modifiedCount
  modified += (await coll.updateMany(noStatus, { $set: { 'consent.status': 'UNKNOWN' } })).modifiedCount
  modified += (await coll.updateMany(noDoNotContact, { $set: { doNotContact: false, doNotContactAt: null, doNotContactReason: '' } })).modifiedCount
  await SuppressionEntry.createIndexes()
  return { dryRun: false, ...counts, modified }
}
