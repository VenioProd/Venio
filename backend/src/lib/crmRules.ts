import type { Types } from 'mongoose'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmRule, { type ICrmRule, type IRuleAction, type IRuleCondition, type RuleTrigger } from '../models/CrmRule.js'
import CrmRuleRun, { type IRunStep } from '../models/CrmRuleRun.js'
import { ADMIN_ROLES } from './permissions.js'
import { getRoundRobinAssignee } from './crmAutomations.js'
import { ensureClientForWonLead, ensureProjectForWonLead } from './crmClientConversion.js'
import { createNotification } from './notifications.js'
import { sendBulkEmail } from './email/send.js'
import { logInteraction } from './interactions.js'
import { isAssignableCrmUser } from './crmScope.js'
import { buildUnsubscribeUrl, checkProspectContact, DO_NOT_CONTACT } from './crmPrivacy.js'
import logger from './logger.js'

/** Profondeur maximale d'une chaîne règle → action → règle. */
export const MAX_RULE_DEPTH = 3
const DAY_MS = 24 * 3600 * 1000
const OPEN_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL']
const SETTABLE_FIELDS = ['priority', 'leadTemperature', 'probability', 'nextActionLabel', 'sector'] as const

export interface LeadEvent {
  type: RuleTrigger
  /** Identifie l'événement : le même événement ne s'exécute qu'une fois par règle et lead. */
  key: string
  from?: string
  to?: string
}
export interface EngineCtx {
  depth: number
  chain: string[]
  actorId: string | null
  simulate?: boolean
  /** Ne journalise pas les exécutions ignorées (balayages quotidiens). */
  quietSkip?: boolean
}
type LeadDoc = InstanceType<typeof Lead>
type PlainLead = Record<string, any>

const ctxRoot = (actorId: string | null = null): EngineCtx => ({ depth: 0, chain: [], actorId })

// ───────────────────────── Conditions (pures) ─────────────────────────

function lastActivityAt(lead: PlainLead): Date {
  const dates = [lead.lastInteractionAt, lead.lastContactAt, lead.statusChangedAt, lead.createdAt]
    .filter(Boolean)
    .map((d: Date | string) => new Date(d).getTime())
  return new Date(dates.length ? Math.max(...dates) : Date.now())
}

export function fieldValue(lead: PlainLead, field: IRuleCondition['field'], now: Date = new Date()): unknown {
  switch (field) {
    case 'daysSinceActivity':
      return Math.floor((now.getTime() - lastActivityAt(lead).getTime()) / DAY_MS)
    case 'daysInStage':
      return Math.floor((now.getTime() - new Date(lead.statusChangedAt ?? lead.createdAt ?? now).getTime()) / DAY_MS)
    case 'budget':
      return lead.budget ?? null
    case 'archived':
      return Boolean(lead.archivedAt)
    case 'assignedTo':
    case 'externalRep':
      return lead[field] ? String(lead[field]) : null
    case 'tags':
      return lead.tags ?? []
    default:
      return lead[field] ?? null
  }
}

export function evaluateCondition(lead: PlainLead, cond: IRuleCondition, now: Date = new Date()): boolean {
  const actual = fieldValue(lead, cond.field, now)
  const expected = cond.value
  const list = Array.isArray(expected) ? expected.map(String) : expected == null ? [] : [String(expected)]
  const isEmpty = actual == null || actual === '' || (Array.isArray(actual) && actual.length === 0)
  switch (cond.operator) {
    case 'eq':
      return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual) === String(expected)
    case 'neq':
      return Array.isArray(actual)
        ? !actual.map(String).includes(String(expected))
        : String(actual) !== String(expected)
    case 'in':
      return Array.isArray(actual) ? actual.some((a) => list.includes(String(a))) : list.includes(String(actual))
    case 'nin':
      return Array.isArray(actual) ? !actual.some((a) => list.includes(String(a))) : !list.includes(String(actual))
    case 'gt':
      return actual != null && Number(actual) > Number(expected)
    case 'gte':
      return actual != null && Number(actual) >= Number(expected)
    case 'lt':
      return actual != null && Number(actual) < Number(expected)
    case 'lte':
      return actual != null && Number(actual) <= Number(expected)
    case 'contains':
      return Array.isArray(actual)
        ? actual.map((a) => String(a).toLowerCase()).includes(String(expected).toLowerCase())
        : String(actual ?? '')
            .toLowerCase()
            .includes(String(expected ?? '').toLowerCase())
    case 'empty':
      return isEmpty
    case 'notEmpty':
      return !isEmpty
    default:
      return false
  }
}

export function evaluateConditions(
  conditions: { op: 'AND' | 'OR'; items: IRuleCondition[] } | undefined,
  lead: PlainLead,
  now: Date = new Date(),
): boolean {
  const items = conditions?.items ?? []
  if (items.length === 0) return true
  return conditions!.op === 'OR'
    ? items.some((c) => evaluateCondition(lead, c, now))
    : items.every((c) => evaluateCondition(lead, c, now))
}

export function matchesTrigger(rule: Pick<ICrmRule, 'trigger'>, event: LeadEvent): boolean {
  if (rule.trigger.type !== event.type) return false
  const p = rule.trigger.params ?? {}
  if (event.type === 'STATUS_CHANGED') {
    const to = [p.to].flat().filter(Boolean).map(String)
    const from = [p.from].flat().filter(Boolean).map(String)
    if (to.length && !to.includes(String(event.to))) return false
    if (from.length && !from.includes(String(event.from))) return false
  }
  return true
}

export function renderTemplate(template: string, lead: PlainLead): string {
  const vars: Record<string, string> = {
    contact: lead.contactName || lead.company || '',
    company: lead.company || '',
    amount: lead.budget != null ? `${Math.round(lead.budget)} €` : '',
  }
  return String(template ?? '').replace(/\{(contact|company|amount)\}/g, (_, k: string) => vars[k])
}

// ───────────────────────── Actions ─────────────────────────

type StepResult = Omit<IRunStep, 'action' | 'at'>
const ok = (message: string, payload?: Record<string, unknown>): StepResult => ({ status: 'OK', message, payload })
const skip = (message: string): StepResult => ({ status: 'SKIP', message })
/** Envoi refusé : la personne s'est opposée à la prospection (fiche ou liste de suppression). */
const blocked = (via: string | undefined): StepResult => ({
  status: 'SKIP',
  message: `Bloqué : ne pas contacter (${DO_NOT_CONTACT}${via === 'SUPPRESSION_LIST' ? ', liste de suppression' : ', fiche du lead'})`,
  payload: { reason: DO_NOT_CONTACT, via },
})

/**
 * Écriture du lead par une règle : même chemin que la fiche (service unique),
 * source « rule », sans émission d'événements — la règle les émet elle-même
 * avec la profondeur de sa chaîne (anti-boucle). Import différé : le service
 * importe ce module.
 */
async function writeByRule(lead: LeadDoc, rule: ICrmRule, patch: Record<string, unknown>, validateAssignee = false) {
  const { applyLeadChange } = await import('./crmLeadService.js')
  return applyLeadChange(lead, patch, {
    actor: null,
    source: 'rule',
    emit: false,
    validateAssignee,
    labelSuffix: '(règle)',
    activityMeta: { ruleId: rule._id },
  })
}

async function ownerOf(lead: PlainLead, spec: unknown): Promise<string | null> {
  if (spec && spec !== 'owner') return String(spec)
  const id = lead.assignedTo ?? lead.createdBy
  return id ? String(id) : null
}

async function adminIds(): Promise<string[]> {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } })
    .select('_id')
    .lean()
  return admins.map((a) => String(a._id))
}

async function runAction(action: IRuleAction, rule: ICrmRule, lead: LeadDoc, ctx: EngineCtx): Promise<StepResult> {
  const p = action.params ?? {}
  const sim = ctx.simulate
  switch (action.type) {
    case 'CREATE_TASK': {
      const userId = await ownerOf(lead, p.assignTo)
      if (!userId) return skip('Aucun responsable à qui confier la tâche')
      const title = renderTemplate(String(p.title || 'Relancer {contact}'), lead)
      const exists = await PersonalTask.exists({
        leadId: lead._id,
        title,
        status: { $ne: 'TERMINE' },
        isArchived: false,
      })
      if (exists) return skip(`Tâche « ${title} » déjà ouverte`)
      if (sim) return ok(`Créerait la tâche « ${title} »`)
      const days = Number(p.dueInDays ?? 1)
      await PersonalTask.create({
        userId,
        title,
        leadId: lead._id,
        ruleId: rule._id,
        priority: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'].includes(String(p.priority)) ? p.priority : 'NORMALE',
        dueDate: new Date(Date.now() + days * DAY_MS),
      })
      return ok(`Tâche « ${title} » créée`)
    }
    case 'NOTIFY': {
      const ids =
        p.recipients === 'admins' ? await adminIds() : ([await ownerOf(lead, p.recipients)].filter(Boolean) as string[])
      if (ids.length === 0) return skip('Aucun destinataire')
      if (sim) return ok(`Notifierait ${ids.length} personne(s)`)
      const title = renderTemplate(String(p.title || 'Règle CRM : {company}'), lead)
      for (const recipient of ids) {
        await createNotification({
          recipient,
          type: 'CRM_LEAD_STATUS_CHANGED',
          title,
          message: renderTemplate(String(p.message || ''), lead),
          link: `/admin/crm/leads/${lead._id}`,
          metadata: { leadId: String(lead._id), ruleId: String(rule._id) },
        })
      }
      return ok(`${ids.length} notification(s) envoyée(s)`)
    }
    case 'ASSIGN': {
      const target =
        p.strategy === 'round_robin'
          ? await getRoundRobinAssignee()
          : p.userId
            ? (String(p.userId) as unknown as Types.ObjectId)
            : null
      if (!target) return skip('Aucun commercial disponible')
      if (String(lead.assignedTo ?? '') === String(target)) return skip('Déjà assigné à ce commercial')
      // Même contrôle que la fiche : un membre actif, habilité à suivre un lead.
      if (!(await isAssignableCrmUser(String(target))))
        return skip('Commercial introuvable, inactif ou non habilité à suivre un lead')
      if (sim) return ok('Assignerait le lead')
      await writeByRule(lead, rule, { assignedTo: target })
      await fireLeadEvent(
        lead.id,
        { type: 'LEAD_ASSIGNED', key: `assigned:${target}:${Date.now()}`, to: String(target) },
        next(ctx, rule),
      )
      return ok('Lead assigné', { assignedTo: String(target) })
    }
    case 'SET_STATUS': {
      const to = String(p.status)
      if (!['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'].includes(to))
        return skip('Statut inconnu')
      if (lead.status === to) return skip('Déjà à ce statut')
      if (sim) return ok(`Passerait le lead à ${to}`)
      const from = lead.status
      // Même chemin que la fiche : historique, automatisations de statut et
      // conversion WON. Import différé : le service importe ce module.
      // L'événement est émis ici, avec la profondeur de la chaîne de règles.
      const { applyLeadChange } = await import('./crmLeadService.js')
      await applyLeadChange(
        lead,
        { status: to },
        { actor: null, source: 'rule', emit: false, activityMeta: { ruleId: rule._id } },
      )
      const changedAt = lead.statusChangedAt ?? new Date()
      await fireLeadEvent(
        lead.id,
        { type: 'STATUS_CHANGED', key: `status:${to}:${changedAt.getTime()}`, from, to },
        next(ctx, rule),
      )
      return ok(`Statut ${from} → ${to}`)
    }
    case 'ADD_TAG': {
      const tag = String(p.tag ?? '')
        .trim()
        .slice(0, 40)
      if (!tag) return skip('Tag vide')
      if (lead.tags?.includes(tag)) return skip('Tag déjà présent')
      if (sim) return ok(`Ajouterait le tag « ${tag} »`)
      await writeByRule(lead, rule, { tags: [...(lead.tags ?? []), tag] })
      return ok(`Tag « ${tag} » ajouté`)
    }
    case 'SET_FIELD': {
      const field = String(p.field)
      if (!(SETTABLE_FIELDS as readonly string[]).includes(field)) return skip(`Champ non modifiable : ${field}`)
      // Même normalisation que la fiche : une valeur hors liste (priorité, température) est refusée.
      const { normalizeLeadPatch } = await import('./crmLeadService.js')
      const patch = normalizeLeadPatch({ [field]: p.value })
      if (!(field in patch)) return skip(`Valeur refusée pour ${field}`)
      if (String((lead as unknown as Record<string, unknown>)[field] ?? '') === String(patch[field] ?? ''))
        return skip(`${field} déjà à cette valeur`)
      if (sim) return ok(`Définirait ${field}`)
      await writeByRule(lead, rule, { [field]: patch[field] })
      return ok(`${field} mis à jour`)
    }
    case 'SEND_EMAIL': {
      const to = (lead.contactEmail || '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return skip('Le lead n’a pas d’adresse e-mail valide')
      // Opposition (fiche) ou liste de suppression : rien ne part, pas même en attente de validation.
      const contact = await checkProspectContact(lead, to)
      if (!contact.allowed) return blocked(contact.via)
      const subject = renderTemplate(String(p.subject || 'Suite à notre échange'), lead)
      const body = renderTemplate(String(p.body || 'Bonjour {contact},'), lead)
      if (sim) return ok(`Enverrait « ${subject} » à ${to}`)
      if (rule.requireApproval) {
        return {
          status: 'PENDING',
          message: `E-mail « ${subject} » en attente de validation`,
          payload: { to, subject, body },
        }
      }
      return deliverEmail(lead, { to, subject, body }, null)
    }
    case 'CREATE_CLIENT': {
      if (lead.status !== 'WON') return skip('Le lead n’est pas gagné')
      if (lead.clientAccountId) return skip('Compte client déjà lié')
      if (sim) return ok('Créerait le compte client')
      const client = await ensureClientForWonLead(lead, null, true)
      return client ? ok('Compte client créé', { clientId: String(client._id) }) : skip('Compte client non créé')
    }
    case 'CREATE_PROJECT': {
      if (lead.status !== 'WON') return skip('Le lead n’est pas gagné')
      if (await Project.exists({ sourceLead: lead._id })) return skip('Projet déjà créé pour ce lead')
      if (!lead.clientAccountId) return skip('Aucun compte client lié')
      if (sim) return ok('Créerait le projet')
      // Contrôle d'existence repris au moment de créer : la conversion WON du service a pu passer entre-temps.
      const project = await ensureProjectForWonLead(lead, null)
      return project
        ? ok(`Projet « ${project.name} » créé`, { projectId: String(project._id) })
        : skip('Projet non créé')
    }
    case 'ARCHIVE': {
      if (lead.archivedAt) return skip('Déjà archivé')
      if (sim) return ok('Archiverait le lead')
      await writeByRule(lead, rule, { archivedAt: new Date() })
      return ok('Lead archivé')
    }
    default:
      return skip('Action inconnue')
  }
}

const next = (ctx: EngineCtx, rule: ICrmRule): EngineCtx => ({
  ...ctx,
  depth: ctx.depth + 1,
  chain: [...ctx.chain, String(rule._id)],
})

/**
 * Envoie l'e-mail, le consigne dans la timeline du lead et rend le résultat de l'étape.
 *
 * L'opposition est revérifiée au moment d'envoyer : un e-mail validé des jours
 * après sa mise en attente ne part pas vers une personne qui s'est désinscrite
 * entre-temps. Chaque message porte un lien de désinscription signé.
 */
export async function deliverEmail(
  lead: LeadDoc,
  mail: { to: string; subject: string; body: string },
  authorId: string | null,
): Promise<StepResult> {
  const contact = await checkProspectContact(lead, mail.to)
  if (!contact.allowed) return blocked(contact.via)
  try {
    const outcome = await sendBulkEmail({
      subject: mail.subject,
      body: mail.body,
      recipients: [{ email: mail.to, name: lead.contactName }],
      unsubscribeUrl: buildUnsubscribeUrl(lead._id as Types.ObjectId, mail.to),
    })
    await logInteraction({
      subjectType: 'LEAD',
      subjectId: lead._id,
      kind: 'EMAIL',
      direction: 'OUT',
      subject: mail.subject,
      body: mail.body,
      author: authorId,
      recipients: outcome.results.map((r: { email: string; name: string; success: boolean; error?: string }) => ({
        email: r.email,
        name: r.name,
        status: r.success ? 'SENT' : 'FAILED',
        error: r.error ?? '',
      })),
      deliveryStatus: outcome.failed === 0 ? 'SENT' : outcome.sent === 0 ? 'FAILED' : 'PARTIAL',
    })
    return outcome.failed === 0
      ? ok(`E-mail « ${mail.subject} » envoyé à ${mail.to}`)
      : { status: 'ERR', message: `E-mail refusé : ${outcome.results[0]?.error ?? 'échec SMTP'}` }
  } catch (err) {
    return { status: 'ERR', message: `E-mail non envoyé : ${(err as Error).message}` }
  }
}

// ───────────────────────── Exécution d'une règle ─────────────────────────

async function throttled(rule: ICrmRule, leadId: Types.ObjectId): Promise<boolean> {
  const { perLead, days } = rule.limits
  if (perLead === 'NONE') return false
  const filter: Record<string, unknown> = {
    rule: rule._id,
    lead: leadId,
    status: { $in: ['OK', 'PENDING', 'RUNNING', 'ERR'] },
  }
  if (perLead === 'DAYS') filter.createdAt = { $gte: new Date(Date.now() - days * DAY_MS) }
  return Boolean(await CrmRuleRun.exists(filter))
}

export async function runRule(rule: ICrmRule, lead: LeadDoc, event: LeadEvent, ctx: EngineCtx) {
  if (!matchesTrigger(rule, event)) return null
  if (!evaluateConditions(rule.conditions, lead)) return null

  const eventKey = ctx.simulate
    ? `${rule._id}:${lead._id}:${event.key}:sim:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`
    : `${rule._id}:${lead._id}:${event.key}`
  const base = {
    rule: rule._id,
    ruleName: rule.name,
    lead: lead._id,
    leadLabel: lead.company,
    eventKey,
    trigger: event.type,
    depth: ctx.depth,
  }

  if (!ctx.simulate && (await throttled(rule, lead._id as Types.ObjectId))) {
    if (ctx.quietSkip) return null
    return CrmRuleRun.create({
      ...base,
      status: 'SKIP',
      steps: [{ action: 'LIMIT', status: 'SKIP', message: 'Ignorée : limite par lead atteinte', at: new Date() }],
    }).catch(() => null)
  }

  // On réserve la clé d'événement avant d'agir : un rejeu ne duplique aucun effet.
  let run
  try {
    run = await CrmRuleRun.create({ ...base, status: ctx.simulate ? 'SIM' : 'RUNNING' })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null
    throw err
  }

  const started = Date.now()
  const steps: IRunStep[] = []
  for (const action of rule.actions) {
    let result: StepResult
    try {
      result = await runAction(action, rule, lead, ctx)
    } catch (err) {
      result = { status: 'ERR', message: (err as Error).message }
      logger.warn({ data: (err as Error).message }, `[crm-rules] ${rule.name}/${action.type}`)
    }
    steps.push({ action: action.type, at: new Date(), ...result })
    if (result.status === 'ERR') break
  }

  const status = ctx.simulate
    ? 'SIM'
    : steps.some((s) => s.status === 'ERR')
      ? 'ERR'
      : steps.some((s) => s.status === 'PENDING')
        ? 'PENDING'
        : steps.length > 0 && steps.every((s) => s.status === 'SKIP')
          ? 'SKIP'
          : 'OK'
  run.status = status
  run.steps = steps
  run.durationMs = Date.now() - started
  await run.save()

  if (!ctx.simulate && status !== 'SKIP') {
    await CrmRule.updateOne(
      { _id: rule._id },
      {
        $inc: { 'stats.runs': 1, [status === 'ERR' ? 'stats.errors' : 'stats.ok']: 1 },
        $set: { 'stats.lastRunAt': new Date() },
      },
    )
  }
  return run
}

/** Évalue les règles actives pour un événement sur un lead. Ne lève jamais. */
export async function fireLeadEvent(leadId: Types.ObjectId | string, event: LeadEvent, ctx: EngineCtx = ctxRoot()) {
  try {
    if (ctx.depth > MAX_RULE_DEPTH) return
    const rules = await CrmRule.find({ status: 'ACTIVE', 'trigger.type': event.type })
    if (rules.length === 0) return
    const lead = await Lead.findById(leadId)
    if (!lead || lead.automationPausedAt || lead.archivedAt) return
    for (const rule of rules) {
      if (ctx.chain.includes(String(rule._id))) continue
      await runRule(rule, lead, event, ctx)
    }
  } catch (err) {
    logger.error({ data: (err as Error).message }, '[crm-rules] fireLeadEvent')
  }
}

/** Déduit les événements d'une sauvegarde de lead et les émet en arrière-plan. */
export function emitLeadChanges(
  lead: { id?: string; _id: unknown; status: string; assignedTo?: unknown; statusChangedAt?: Date | null },
  before: { status?: string; assignedTo?: unknown } | null,
  actorId: string | null = null,
): void {
  const id = String(lead._id)
  const events: LeadEvent[] = []
  if (!before) events.push({ type: 'LEAD_CREATED', key: 'created' })
  if (before?.status && before.status !== lead.status) {
    events.push({
      type: 'STATUS_CHANGED',
      key: `status:${lead.status}:${(lead.statusChangedAt ?? new Date()).getTime()}`,
      from: before.status,
      to: lead.status,
    })
  }
  if (lead.assignedTo && String(before?.assignedTo ?? '') !== String(lead.assignedTo)) {
    events.push({
      type: 'LEAD_ASSIGNED',
      key: `assigned:${lead.assignedTo}:${Date.now()}`,
      to: String(lead.assignedTo),
    })
  }
  if (events.length === 0) return
  void (async () => {
    for (const event of events) await fireLeadEvent(id, event, ctxRoot(actorId))
  })()
}

/** Appelé quand un échange est consigné sur un lead : met à jour les compteurs puis déclenche les règles. */
export async function onLeadInteraction(
  leadId: Types.ObjectId | string,
  occurredAt: Date,
  interactionId: string,
): Promise<void> {
  const lead = await Lead.findByIdAndUpdate(
    leadId,
    { $set: { lastInteractionAt: occurredAt }, $inc: { interactionsCount: 1 } },
    { new: false },
  ).select('_id')
  if (!lead) return
  await fireLeadEvent(leadId, { type: 'INTERACTION_LOGGED', key: `interaction:${interactionId}` })
}

// ───────────────────────── Balayage quotidien & simulation ─────────────────────────

/** Leads candidats d'une règle à déclencheur « état » (inactivité, retard, score). */
export async function candidatesFor(
  rule: ICrmRule,
  now: Date = new Date(),
  leadScope: Record<string, unknown> = {},
): Promise<LeadDoc[]> {
  const { teamLeadFilter } = await import('./crmScope.js')
  const p = rule.trigger.params ?? {}
  const filter: Record<string, unknown> = {
    $and: [teamLeadFilter(), leadScope],
    archivedAt: null,
    automationPausedAt: null,
  }
  if (rule.trigger.type === 'LEAD_INACTIVE') {
    const statuses = Array.isArray(p.statuses) && p.statuses.length ? p.statuses : OPEN_STATUSES
    filter.status = { $in: statuses }
  } else if (rule.trigger.type === 'ACTION_OVERDUE') {
    filter.status = { $in: OPEN_STATUSES }
    filter.nextActionAt = { $lt: now }
  } else if (rule.trigger.type === 'SCORE_AT_LEAST') {
    filter.score = { $gte: Number(p.threshold ?? 70) }
    filter.status = { $in: OPEN_STATUSES }
  } else {
    return []
  }
  const leads = await Lead.find(filter).limit(2000)
  if (rule.trigger.type !== 'LEAD_INACTIVE') return leads
  const days = Number(p.days ?? 7)
  return leads.filter((l) => (now.getTime() - lastActivityAt(l).getTime()) / DAY_MS >= days)
}

const sweepEvent = (rule: ICrmRule, now: Date): LeadEvent => ({
  type: rule.trigger.type,
  key: `sweep:${now.toISOString().slice(0, 10)}`,
})

export async function sweepRules(now: Date = new Date()): Promise<{ rules: number; runs: number }> {
  const rules = await CrmRule.find({
    status: 'ACTIVE',
    'trigger.type': { $in: ['LEAD_INACTIVE', 'ACTION_OVERDUE', 'SCORE_AT_LEAST'] },
  })
  let runs = 0
  for (const rule of rules) {
    try {
      const leads = (await candidatesFor(rule, now))
        .filter((l) => evaluateConditions(rule.conditions, l, now))
        .slice(0, rule.limits.maxPerRun)
      for (const lead of leads) {
        const run = await runRule(rule, lead, sweepEvent(rule, now), { ...ctxRoot(), quietSkip: true })
        if (run) runs++
      }
    } catch (err) {
      logger.error({ data: (err as Error).message }, `[crm-rules] sweep ${rule.name}`)
    }
  }
  return { rules: rules.length, runs }
}

/** Simulation : leads qui déclencheraient la règle aujourd'hui, sans aucun effet (sauf journal « SIM » si `record`). */
export async function simulateRule(
  rule: ICrmRule,
  opts: { record?: boolean; limit?: number; leadScope?: Record<string, unknown> } = {},
) {
  const { teamLeadFilter } = await import('./crmScope.js')
  const now = new Date()
  const limit = opts.limit ?? 50
  const pool: LeadDoc[] = ['LEAD_INACTIVE', 'ACTION_OVERDUE', 'SCORE_AT_LEAST'].includes(rule.trigger.type)
    ? await candidatesFor(rule, now, opts.leadScope)
    : await Lead.find({ archivedAt: null, $and: [teamLeadFilter(), opts.leadScope ?? {}] }).limit(2000)
  const matching = pool.filter((l) => evaluateConditions(rule.conditions, l, now))
  const sample = matching.slice(0, limit)
  if (opts.record) {
    for (const lead of sample) {
      await runRule(
        rule,
        lead,
        { type: rule.trigger.type, key: 'simulation', to: String(rule.trigger.params?.to ?? '') },
        { ...ctxRoot(), simulate: true },
      )
    }
  }
  return {
    total: matching.length,
    leads: sample.map((l) => ({ id: String(l._id), company: l.company, status: l.status })),
  }
}

/** Valide l'envoi d'un e-mail en attente (étape PENDING d'une exécution). */
export async function approveRun(runId: string, actorId: string) {
  const run = await CrmRuleRun.findById(runId)
  if (!run || run.status !== 'PENDING') return null
  const lead = await Lead.findById(run.lead)
  if (!lead) return null
  for (const step of run.steps) {
    if (step.status !== 'PENDING' || !step.payload) continue
    const result = await deliverEmail(lead, step.payload as { to: string; subject: string; body: string }, actorId)
    // Un envoi bloqué (opposition survenue entre-temps) reste une étape ignorée, avec sa raison.
    step.status = result.status === 'ERR' ? 'ERR' : result.status === 'SKIP' ? 'SKIP' : 'OK'
    step.message = result.message
    step.payload = result.status === 'SKIP' ? result.payload : undefined
  }
  run.status = run.steps.some((s) => s.status === 'ERR')
    ? 'ERR'
    : run.steps.length > 0 && run.steps.every((s) => s.status === 'SKIP')
      ? 'SKIP'
      : 'OK'
  run.markModified('steps')
  await run.save()
  return run
}

export async function rejectRun(runId: string) {
  const run = await CrmRuleRun.findById(runId)
  if (!run || run.status !== 'PENDING') return null
  for (const step of run.steps) {
    if (step.status === 'PENDING') {
      step.status = 'SKIP'
      step.message = 'Refusé : e-mail non envoyé'
      step.payload = undefined
    }
  }
  run.status = 'SKIP'
  run.markModified('steps')
  await run.save()
  return run
}

/** Rejoue une exécution en erreur : l'idempotence des actions (tâche déjà ouverte, tag présent…) évite les doublons. */
export async function retryRun(runId: string) {
  const run = await CrmRuleRun.findById(runId)
  if (!run || run.status !== 'ERR') return null
  const rule = await CrmRule.findById(run.rule)
  const lead = await Lead.findById(run.lead)
  if (!rule || !lead) return null
  await CrmRuleRun.deleteOne({ _id: run._id })
  return runRule(
    rule,
    lead,
    { type: rule.trigger.type, key: run.eventKey.split(':').slice(2).join(':') || 'retry', to: undefined },
    { ...ctxRoot(), depth: 0 },
  )
}

// ───────────────────────── Règles prédéfinies ─────────────────────────

export const SEED_RULES: Array<Partial<ICrmRule> & { systemKey: string }> = [
  {
    systemKey: 'relance-7j',
    name: 'Relance après 7 jours sans activité',
    description: 'Évite les leads qui s’endorment',
    trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED', 'DEMO', 'PROPOSAL'] } },
    conditions: { op: 'AND', items: [] },
    actions: [
      { type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' } },
      {
        type: 'NOTIFY',
        params: { recipients: 'owner', title: 'Lead inactif : {company}', message: 'Aucune activité depuis 7 jours.' },
      },
    ],
    limits: { perLead: 'DAYS', days: 7, maxPerRun: 50 },
  },
  {
    systemKey: 'gagne-client-projet',
    name: 'Lead gagné → compte client + projet',
    description: 'Aucune saisie manuelle après la signature',
    trigger: { type: 'STATUS_CHANGED', params: { to: ['WON'] } },
    conditions: { op: 'AND', items: [] },
    actions: [
      { type: 'CREATE_CLIENT', params: {} },
      { type: 'CREATE_PROJECT', params: {} },
      { type: 'NOTIFY', params: { recipients: 'admins', title: 'Nouveau client : {company}' } },
    ],
    limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
  },
  {
    systemKey: 'nouveau-lead-formulaire',
    name: 'Nouveau lead de formulaire → assignation + e-mail',
    description: 'Réponse rapide, propriétaire désigné',
    trigger: { type: 'LEAD_CREATED', params: {} },
    conditions: {
      op: 'AND',
      items: [{ field: 'source', operator: 'in', value: ['Site web', 'Formulaire', 'Site', 'FORMULAIRE_SITE'] }],
    },
    actions: [
      { type: 'ASSIGN', params: { strategy: 'round_robin' } },
      {
        type: 'SEND_EMAIL',
        params: {
          subject: 'Nous avons bien reçu votre demande',
          body: 'Bonjour {contact},\n\nMerci pour votre message, nous revenons vers vous très vite.',
        },
      },
      { type: 'CREATE_TASK', params: { title: 'Qualifier {company} sous 24 h', dueInDays: 1, assignTo: 'owner' } },
    ],
    limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
  },
  {
    systemKey: 'proposition-sans-reponse',
    name: 'Proposition sans réponse après 5 jours',
    description: 'Relance courtoise, validée avant envoi',
    trigger: { type: 'LEAD_INACTIVE', params: { days: 5, statuses: ['PROPOSAL'] } },
    conditions: { op: 'AND', items: [{ field: 'budget', operator: 'gte', value: 10000 }] },
    actions: [
      {
        type: 'SEND_EMAIL',
        params: {
          subject: 'Suite à notre proposition',
          body: 'Bonjour {contact},\n\nAvez-vous pu consulter notre proposition ?',
        },
      },
      { type: 'CREATE_TASK', params: { title: 'Appeler {contact} (proposition)', dueInDays: 1, assignTo: 'owner' } },
    ],
    limits: { perLead: 'DAYS', days: 5, maxPerRun: 50 },
  },
  {
    systemKey: 'lead-chaud-48h',
    name: 'Alerte lead chaud non traité 48 h',
    description: 'Équivalent de l’ancien job crmHotLeadAlert',
    system: true,
    trigger: { type: 'SCORE_AT_LEAST', params: { threshold: 70 } },
    conditions: { op: 'AND', items: [{ field: 'daysSinceActivity', operator: 'gte', value: 2 }] },
    actions: [{ type: 'NOTIFY', params: { recipients: 'admins', title: 'Lead chaud sans suivi : {company}' } }],
    limits: { perLead: 'DAYS', days: 2, maxPerRun: 50 },
  },
  {
    systemKey: 'relance-post-demo',
    name: 'Relance 3 jours après une démo sans suite',
    description: 'Équivalent de l’ancien job crmPostDemoFollowup',
    system: true,
    trigger: { type: 'LEAD_INACTIVE', params: { days: 3, statuses: ['DEMO'] } },
    conditions: { op: 'AND', items: [] },
    actions: [
      { type: 'CREATE_TASK', params: { title: 'Relancer {contact} après la démo', dueInDays: 1, assignTo: 'owner' } },
      {
        type: 'NOTIFY',
        params: {
          recipients: 'owner',
          title: 'Suivi post-démo : {company}',
          message: 'Aucun échange depuis la démo il y a 3 jours.',
        },
      },
    ],
    limits: { perLead: 'DAYS', days: 7, maxPerRun: 50 },
  },
  {
    systemKey: 'perdu-archiver',
    name: 'Perdu → tag et relance à 6 mois',
    description: 'Garde la porte ouverte sans encombrer le pipeline',
    trigger: { type: 'STATUS_CHANGED', params: { to: ['LOST'] } },
    conditions: { op: 'AND', items: [] },
    actions: [
      { type: 'ADD_TAG', params: { tag: 'recontacter-6m' } },
      { type: 'CREATE_TASK', params: { title: 'Reprendre contact avec {company}', dueInDays: 180, assignTo: 'owner' } },
    ],
    limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
  },
]

// ───────────────────── Une seule source par comportement ─────────────────────

/**
 * Comportements que les tâches planifiées (`lib/crmScheduler.ts`,
 * `automation/jobs/crm*.ts`) assurent aussi : quand la règle prédéfinie est
 * ACTIVE, elle seule agit et les tâches s'abstiennent. L'inverse n'existe pas :
 * une règle ne consulte jamais les tâches. Table complète en tête de
 * `crmScheduler.ts`.
 */
export const SYSTEM_RULE_FOR = {
  proposalFollowUp: 'proposition-sans-reponse',
  inactiveLeadFollowUp: 'relance-7j',
  postDemoFollowUp: 'relance-post-demo',
  hotLeadAlert: 'lead-chaud-48h',
} as const
export type CoveredBehavior = keyof typeof SYSTEM_RULE_FOR

/** Durée du cache des règles actives : une activation est prise en compte en moins d'une minute. */
export const SYSTEM_RULE_CACHE_MS = 60_000
let activeSystemKeys: { keys: Set<string>; at: number } | null = null

/** Vrai si la règle prédéfinie `systemKey` est ACTIVE (lecture en base, cache court). */
export async function isSystemRuleActive(systemKey: string, now: number = Date.now()): Promise<boolean> {
  if (!activeSystemKeys || now - activeSystemKeys.at >= SYSTEM_RULE_CACHE_MS) {
    const rules = await CrmRule.find({ status: 'ACTIVE', systemKey: { $exists: true, $ne: null } })
      .select('systemKey')
      .lean()
    activeSystemKeys = { keys: new Set(rules.map((r) => String(r.systemKey))), at: now }
  }
  return activeSystemKeys.keys.has(systemKey)
}

/** Vrai si la règle qui couvre ce comportement est active : la tâche planifiée doit alors s'abstenir. */
export function isCoveredByActiveRule(behavior: CoveredBehavior, now?: number): Promise<boolean> {
  return isSystemRuleActive(SYSTEM_RULE_FOR[behavior], now)
}

/** Vide le cache (tests, ou après une activation qui doit valoir immédiatement). */
export function resetSystemRuleCache(): void {
  activeSystemKeys = null
}

/** Insère les règles prédéfinies absentes, en brouillon : rien ne se déclenche avant activation humaine. */
export async function seedCrmRules(): Promise<number> {
  let created = 0
  for (const seed of SEED_RULES) {
    const res = await CrmRule.updateOne(
      { systemKey: seed.systemKey },
      { $setOnInsert: { ...seed, status: 'DRAFT', requireApproval: true } },
      { upsert: true },
    )
    if (res.upsertedCount) created++
  }
  return created
}
