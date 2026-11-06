import mongoose, { type Types } from 'mongoose'
import Lead, { LEAD_PROJECTS } from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Interaction from '../models/Interaction.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import User from '../models/User.js'
import CrmSettings from '../models/CrmSettings.js'
import type { ICrmSettings } from '../types/models/index.js'
import { calculateLeadScore, logLeadActivity, notifyAssignment, shouldAutoQualify } from './crmAutomations.js'
import { processWonLead, type WonLeadOutcome } from './crmClientConversion.js'
import { normalizeEnrichedLeadFields } from './crmLeadFields.js'
import { normalizePrivacyPatch, preparePrivacyChange } from './crmPrivacy.js'
import { emitLeadChanges } from './crmRules.js'
import { isAssignableCrmUser } from './crmScope.js'
import { entityFromProject, isGroupEntity } from './groupEntities.js'
import { createNotification } from './notifications.js'
import { notifySuperAdmins } from './notifyHelpers.js'

/**
 * Point d'entrée unique des modifications de lead.
 *
 * Fiche admin, action groupée, API agent, formulaire public et règles
 * d'automatisation passent par `applyLeadChange` : une même modification
 * produit partout les mêmes effets (historique des statuts, automatisations de
 * statut, score, conversion d'un lead gagné, événements des règles). Les
 * différences voulues entre canaux (e-mail d'assignation, notifications) sont
 * décrites dans `SOURCE_POLICY`, pas dispersées dans les routes.
 */

export const CRM_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'] as const
export const LEAD_PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
export const LEAD_TEMPERATURES = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'] as const
const CLOSED_STATUSES = ['WON', 'LOST']

export type LeadChangeSource = 'admin' | 'bulk' | 'agent' | 'form' | 'rule' | 'scheduler'

export interface LeadChangeContext {
  /** Utilisateur à l'origine du changement ; `null` pour le système (formulaire, règle, agent sans identité). */
  actor: string | null
  source: LeadChangeSource
  /** Réglages déjà chargés (action groupée) ; relus sinon. */
  settings?: ICrmSettings
  /** Émettre les événements des règles (défaut : oui). Une règle les émet elle-même, avec sa profondeur. */
  emit?: boolean
  /** Contrôler que l'assigné est un membre actif habilité (défaut : oui). */
  validateAssignee?: boolean
  /** Complète le payload des activités STATUS_CHANGE, ASSIGNED et ARCHIVED / RESTORED (ex. `ruleId`). */
  activityMeta?: Record<string, unknown>
  /** Suffixe ajouté aux libellés d'activité, ex. « (action groupée) ». */
  labelSuffix?: string
}

interface SourcePolicy {
  /** Passage automatique LEAD → QUALIFIED quand budget et source sont connus. */
  autoQualify: boolean
  /** E-mail au commercial nouvellement assigné (réglage `emailOnAssignment`). */
  assignmentEmail: boolean
  /** Notification du créateur et de l'assigné à chaque changement de statut hors WON. */
  statusNotifications: boolean
}

/**
 * Ce qui diffère volontairement d'un canal à l'autre. L'action groupée et les
 * règles n'envoient ni e-mail ni notification par lead : 200 leads traités ne
 * doivent pas produire 200 messages, et une règle qui change un statut garde
 * la main sur ses propres notifications. Les tâches planifiées (escalade,
 * archivage des perdus) suivent la même politique que les règles : elles
 * envoient elles-mêmes leurs alertes, une fois par lead et par fenêtre.
 */
export const SOURCE_POLICY: Record<LeadChangeSource, SourcePolicy> = {
  admin: { autoQualify: true, assignmentEmail: true, statusNotifications: true },
  agent: { autoQualify: true, assignmentEmail: false, statusNotifications: true },
  form: { autoQualify: true, assignmentEmail: false, statusNotifications: false },
  bulk: { autoQualify: false, assignmentEmail: false, statusNotifications: false },
  rule: { autoQualify: false, assignmentEmail: false, statusNotifications: false },
  scheduler: { autoQualify: false, assignmentEmail: false, statusNotifications: false },
}

/** Erreur métier : la route la traduit dans son propre format d'erreur. */
export class LeadChangeError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'LeadChangeError'
  }
}

export function isLeadChangeError(err: unknown): err is LeadChangeError {
  return err instanceof LeadChangeError
}

type LeadDoc = InstanceType<typeof Lead>
type LeadTarget = LeadDoc | Types.ObjectId | string | null

export interface LeadChangeResult {
  lead: LeadDoc
  created: boolean
  /** Statut et assigné avant la modification ; `null` pour une création. */
  before: { status: string; assignedTo: unknown } | null
  /** Transitions de statut écrites dans l'historique, dans l'ordre. */
  transitions: Array<{ from: string; to: string; auto: boolean }>
  assigneeChanged: boolean
  /** Résultat de la conversion WON ; `null` si le lead n'est pas gagné. */
  won: WonLeadOutcome | null
}

// ───────────────────────── Normalisation ─────────────────────────

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

/**
 * Normalise un corps de requête en patch de lead : seuls les champs connus et
 * valides passent. Commun à l'admin et à l'agent.
 *
 * `lenientAssignee` : un identifiant d'assigné mal formé devient `null`
 * (comportement historique de l'API agent) au lieu d'être transmis pour être
 * refusé par la validation.
 */
export function normalizeLeadPatch(
  body: Record<string, any> = {},
  opts: { lenientAssignee?: boolean } = {},
): Record<string, any> {
  const payload: Record<string, any> = {}
  if (body.company !== undefined) payload.company = String(body.company || '').trim()
  if (body.contactName !== undefined) payload.contactName = String(body.contactName || '')
  if (body.contactEmail !== undefined) payload.contactEmail = String(body.contactEmail || '')
  if (body.contactPhone !== undefined) payload.contactPhone = String(body.contactPhone || '')
  if (body.source !== undefined) payload.source = String(body.source || '')
  if (typeof body.project === 'string' && (['', ...LEAD_PROJECTS] as string[]).includes(body.project)) payload.project = body.project
  // Entité du groupe : valeur connue seulement ; une valeur inconnue est ignorée comme les autres énumérations.
  if (isGroupEntity(body.entity)) payload.entity = body.entity
  if (typeof body.status === 'string' && (CRM_STATUSES as readonly string[]).includes(body.status)) payload.status = body.status
  if (typeof body.priority === 'string' && (LEAD_PRIORITIES as readonly string[]).includes(body.priority)) payload.priority = body.priority
  if (body.budget !== undefined) {
    const value = Number(body.budget)
    payload.budget = Number.isNaN(value) ? null : value
  }
  if (body.nextActionAt !== undefined) payload.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null
  if (body.lastContactAt !== undefined) payload.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt) : null
  if (body.notes !== undefined) payload.notes = String(body.notes || '')
  if (body.serviceType !== undefined) payload.serviceType = String(body.serviceType || '')
  if (typeof body.leadTemperature === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(body.leadTemperature)) {
    payload.leadTemperature = body.leadTemperature
  }
  if (body.interactionNotes !== undefined) payload.interactionNotes = String(body.interactionNotes || '')
  if (body.lostReason !== undefined) payload.lostReason = String(body.lostReason || '').trim()
  if (body.lostComment !== undefined) payload.lostComment = String(body.lostComment || '')
  if (body.assignedTo !== undefined) {
    payload.assignedTo = opts.lenientAssignee ? (isObjectId(body.assignedTo) ? body.assignedTo : null) : body.assignedTo || null
  }
  return { ...payload, ...normalizeEnrichedLeadFields(body), ...normalizePrivacyPatch(body) }
}

// ───────────────────────── Validation ─────────────────────────

/** La liste des motifs de perte est fermée : une valeur hors liste rendrait les statistiques de perte inexploitables. */
export function assertLostReason(reason: unknown, settings: Pick<ICrmSettings, 'lostReasons'>): void {
  if (typeof reason !== 'string' || reason === '') return
  if (!settings.lostReasons.includes(reason)) {
    throw new LeadChangeError(400, 'INVALID_LOST_REASON', 'Motif de perte inconnu', { allowed: settings.lostReasons })
  }
}

/** Un lead ne se confie qu'à un membre actif de l'équipe habilité à le suivre. */
export async function assertAssignable(userId: unknown): Promise<void> {
  if (userId == null || userId === '') return
  if (!(await isAssignableCrmUser(String(userId)))) {
    throw new LeadChangeError(400, 'INVALID_ASSIGNEE', 'Commercial introuvable, inactif ou non habilité à suivre un lead')
  }
}

// ───────────────────────── Effets de statut ─────────────────────────

function addDays(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

/** Automatisations de base pilotées par les réglages, à l'arrivée dans un statut. */
function applyStatusAutomations(lead: LeadDoc, status: string, settings: ICrmSettings): void {
  if (status === 'CONTACTED' && !lead.lastContactAt && settings.autoLastContactOnContacted) {
    lead.lastContactAt = new Date()
  }
  if (status === 'PROPOSAL' && !lead.nextActionAt && settings.autoNextActionOnProposal) {
    lead.nextActionAt = addDays(settings.proposalFollowUpDays || 3)
  }
  if (status === 'DEMO' && !lead.nextActionAt && settings.autoNextActionOnDemo) {
    lead.nextActionAt = addDays(settings.demoFollowUpDays || 1)
  }
  if (CLOSED_STATUSES.includes(status) && settings.clearNextActionOnClose) {
    lead.nextActionAt = null
  }
}

function notifyStatusChange(lead: LeadDoc, from: string, to: string, actor: string | null): void {
  const recipients = new Set<string>()
  if (lead.assignedTo) recipients.add(String(lead.assignedTo))
  if (lead.createdBy) recipients.add(String(lead.createdBy))
  if (actor) recipients.delete(actor)
  for (const recipientId of recipients) {
    createNotification({
      recipient: recipientId,
      type: 'CRM_LEAD_STATUS_CHANGED',
      title: `Lead ${lead.company} — ${to}`,
      message: `Statut passé de ${from} à ${to}`,
      link: `/admin/crm/leads/${lead._id}`,
      metadata: { leadId: String(lead._id) },
    }).catch(() => {})
  }
}

function notifyWon(lead: LeadDoc, actor: string | null): void {
  notifySuperAdmins({
    type: 'CRM_LEAD_CONVERTED',
    title: '🎉 Nouveau client signé',
    message: `${lead.company} (lead converti en WON)`,
    link: `/admin/crm/leads/${lead._id}`,
    metadata: { leadId: String(lead._id) },
    excludeUserId: actor ?? undefined,
  }).catch(() => {})
}

// ───────────────────────── Point d'entrée ─────────────────────────

async function resolveLead(target: LeadTarget): Promise<LeadDoc | null> {
  if (target == null) return null
  if (target instanceof Lead) return target as LeadDoc
  return Lead.findById(target)
}

/**
 * Crée (`target` = `null`) ou modifie un lead et en applique tous les effets.
 *
 * Les contrôles d'accès (périmètre, droit de réassigner) restent dans les
 * routes : ils dépendent de l'appelant. Le service contrôle ce qui vaut pour
 * tous : motif de perte dans la liste fermée, assigné habilité.
 *
 * Lève `LeadChangeError` : 400 sur une donnée refusée (rien n'est écrit), 404
 * si le lead désigné par son identifiant n'existe pas.
 */
export async function applyLeadChange(
  target: LeadTarget,
  input: Record<string, any>,
  ctx: LeadChangeContext,
): Promise<LeadChangeResult> {
  // Copie : la préparation RGPD complète le patch (dates), sans toucher à l'objet de l'appelant.
  const patch: Record<string, any> = { ...input }
  const policy = SOURCE_POLICY[ctx.source]
  const settings = ctx.settings ?? (await CrmSettings.getSettings())
  const suffix = ctx.labelSuffix ? ` ${ctx.labelSuffix}` : ''

  const existing = await resolveLead(target)
  if (target != null && !existing) throw new LeadChangeError(404, 'NOT_FOUND', 'Lead not found')
  const created = !existing

  // Validation commune, avant toute écriture.
  if (patch.lostReason !== undefined) assertLostReason(patch.lostReason, settings)
  const oldAssignee = existing?.assignedTo ? String(existing.assignedTo) : null
  const assigneeTouched = patch.assignedTo !== undefined && String(patch.assignedTo ?? '') !== String(oldAssignee ?? '')
  if (assigneeTouched && ctx.validateAssignee !== false) await assertAssignable(patch.assignedTo)

  // Consentement et opposition : fusion avec l'existant, dates posées ici.
  const privacyEvents = preparePrivacyChange(existing, patch, ctx.source)

  const lead: LeadDoc = existing ?? new Lead({})
  const before = existing ? { status: String(existing.status), assignedTo: existing.assignedTo } : null
  const transitions: LeadChangeResult['transitions'] = []

  Object.assign(lead, patch)
  // Sans entité explicite, un nouveau lead prend celle de son projet (Arrow → ARROW, le reste → VENIO).
  if (created && patch.entity === undefined) lead.entity = entityFromProject(lead.project)

  const enterStatus = (from: string, to: string, auto: boolean) => {
    transitions.push({ from, to, auto })
    lead.statusChangedAt = new Date()
    applyStatusAutomations(lead, to, settings)
  }

  if (created) {
    // Le statut initial n'est pas une transition, mais ses automatisations s'appliquent.
    lead.statusChangedAt = new Date()
    applyStatusAutomations(lead, lead.status, settings)
  } else if (before && lead.status !== before.status) {
    enterStatus(before.status, lead.status, false)
  }

  // Auto-qualification : budget et source connus, encore au stade LEAD.
  if (policy.autoQualify && settings.autoQualifyEnabled && lead.status === 'LEAD' && shouldAutoQualify(lead as any)) {
    lead.status = 'QUALIFIED' as LeadDoc['status']
    enterStatus('LEAD', 'QUALIFIED', true)
  }

  if (settings.scoringEnabled) {
    lead.score = calculateLeadScore(lead as any, settings.scoringWeights as any)
  }

  // L'acteur ne reçoit pas la notification d'assignation de son propre geste (hook du modèle).
  if (ctx.actor) lead.$locals.assignmentActorId = ctx.actor
  await lead.save()

  // ── Historique ──
  if (created && settings.activityLogging) {
    await logLeadActivity(lead._id, 'CREATED', `Lead créé${suffix}`, { company: lead.company, source: ctx.source }, ctx.actor)
  }
  // Les changements de statut sont toujours consignés : ils fondent l'entonnoir
  // et les vitesses du pilotage, qui ne peut pas reconstituer ceux qui manquent.
  for (const t of transitions) {
    await logLeadActivity(
      lead._id,
      'STATUS_CHANGE',
      `Statut: ${t.from} → ${t.to}${t.auto ? ' (auto-qualification)' : ''}${suffix}`,
      { from: t.from, to: t.to, source: ctx.source, ...(t.auto ? { auto: 'AUTO_QUALIFIED' } : {}), ...(ctx.activityMeta ?? {}) },
      ctx.actor,
    )
  }

  const newAssignee = lead.assignedTo ? String(lead.assignedTo) : null
  const assigneeChanged = created ? Boolean(newAssignee) : newAssignee !== oldAssignee
  if (!created && assigneeChanged && settings.activityLogging) {
    await logLeadActivity(lead._id, 'ASSIGNED', `Lead réassigné${suffix}`, { from: oldAssignee, to: newAssignee, ...(ctx.activityMeta ?? {}) }, ctx.actor)
  }
  if (!created && patch.archivedAt !== undefined && settings.activityLogging) {
    await logLeadActivity(
      lead._id,
      lead.archivedAt ? 'ARCHIVED' : 'RESTORED',
      `${lead.archivedAt ? 'Lead archivé' : 'Lead restauré'}${suffix}`,
      { ...(ctx.activityMeta ?? {}) },
      ctx.actor,
    )
  }
  // Consentement et opposition : toujours consignés, ils prouvent le respect des droits de la personne.
  for (const event of privacyEvents) {
    await logLeadActivity(lead._id, event.type, `${event.label}${suffix}`, event.payload, ctx.actor)
  }

  // ── Notifications ──
  if (assigneeChanged && newAssignee && policy.assignmentEmail && settings.emailOnAssignment) {
    User.findById(newAssignee)
      .then((assignee) => (assignee ? notifyAssignment(lead as any, assignee) : null))
      .catch(() => {})
  }

  const becameWon = lead.status === 'WON' && !created && before?.status !== 'WON'
  if (!created && transitions.length > 0 && lead.status !== 'WON' && policy.statusNotifications) {
    notifyStatusChange(lead, before!.status, lead.status, ctx.actor)
  }

  // ── Conversion d'un lead gagné : compte client + projet, une seule fois ──
  let won: WonLeadOutcome | null = null
  if (lead.status === 'WON') {
    won = await processWonLead(lead, ctx.actor, settings.activityLogging)
    if (becameWon) notifyWon(lead, ctx.actor)
  }

  if (ctx.emit !== false) emitLeadChanges(lead, before, ctx.actor)

  return { lead, created, before, transitions, assigneeChanged, won }
}

/** Raccourci de création. */
export function createLead(patch: Record<string, any>, ctx: LeadChangeContext): Promise<LeadChangeResult> {
  return applyLeadChange(null, patch, ctx)
}

/**
 * Supprime un lead et ce qui n'a de sens que rattaché à lui : historique,
 * échanges, tâches, exécutions de règles. Les projets et devis restent (ils
 * portent du chiffre d'affaires).
 */
export async function deleteLeadCascade(lead: Pick<LeadDoc, '_id'>): Promise<void> {
  await Promise.all([
    LeadActivity.deleteMany({ leadId: lead._id }),
    Interaction.deleteMany({ subjectType: 'LEAD', subjectId: lead._id }),
    PersonalTask.deleteMany({ leadId: lead._id }),
    CrmRuleRun.deleteMany({ lead: lead._id }),
  ])
  await Lead.deleteOne({ _id: lead._id })
}
