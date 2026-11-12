import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import PersonalTask from '../models/PersonalTask.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Project from '../models/Project.js'
import CrmView from '../models/CrmView.js'
import CrmRule, { CONDITION_FIELDS, CONDITION_OPERATORS, RULE_ACTIONS, RULE_TRIGGERS } from '../models/CrmRule.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import { buildTimeline } from '../lib/interactions.js'
import CrmSettings from '../models/CrmSettings.js'
import {
  applyLeadChange,
  assertLostReason,
  deleteLeadCascade,
  isLeadChangeError,
  type LeadChangeContext,
} from '../lib/crmLeadService.js'
import { approveRun, rejectRun, retryRun, simulateRule } from '../lib/crmRules.js'
import { isAssignableCrmUser } from '../lib/crmScope.js'
import { weightedValue } from '../lib/crmRevenue.js'
import { entityCondition, isGroupEntity, leadEntityOf, type GroupEntity } from '../lib/groupEntities.js'
import { buildActorFromReq, recordAudit } from '../lib/audit/auditHelpers.js'
import { createCrmSequencesRouter } from './crmSequences.js'

/**
 * Routes CRM « enrichies » (vues, actions groupées, export, fiche, règles),
 * montées à l'identique côté admin (`/api/admin/crm`) et côté agent
 * (`/api/v1/agent/crm`). Seuls les adaptateurs diffèrent : garde d'accès,
 * format d'erreur, périmètre, propriétaire des vues.
 */
export interface CrmExtrasAdapters {
  read: RequestHandler[]
  write: RequestHandler[]
  /** Middleware d'idempotence propre à l'API admin ; vide côté agent (déjà global). */
  idem: RequestHandler[]
  fail: (res: Response, status: number, code: string, message: string) => void
  actor: (req: Request) => Promise<{ id: string | null; isSuper: boolean }>
  leadScope: (req: Request) => Record<string, unknown>
  /** Périmètre d'écriture : plus étroit que la lecture (le commercial ne modifie que ses leads). */
  writeScope: (req: Request) => Record<string, unknown>
  /** Entités du groupe permises (`null` : toutes) ; sert au filtre `?entity=`, en plus de `leadScope`. */
  entityScope?: (req: Request) => GroupEntity[] | null
  /** Un humain peut activer une règle ; un agent seulement avec le scope `admin:*`. */
  canActivateRules: (req: Request) => boolean
  /**
   * Gouvernance des règles : créer, modifier ou supprimer une règle, valider,
   * refuser ou relancer une exécution. Par défaut ouvert à quiconque passe
   * `write` (cas de l'agent, cadré par ses scopes) ; l'admin le réserve.
   */
  canAdministerRules?: (req: Request) => boolean
  /** Valider, refuser ou relancer une exécution de règle (e-mails en attente). Par défaut : canAdministerRules. */
  canApproveRuns?: (req: Request) => boolean
  /** Créer, modifier, activer, suspendre ou supprimer une séquence d'e-mails. Par défaut : refusé. */
  canAdministerSequences?: (req: Request) => boolean
}

const STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
const BULK_MAX = 200
const BULK_ACTIONS = ['assign', 'status', 'tag', 'archive', 'restore', 'delete'] as const
/** Plafond de lignes d'un export CSV ; atteint, la réponse porte l'en-tête X-Export-Truncated. */
export const EXPORT_MAX_ROWS = 5000

export const EXPORT_COLUMNS: Record<string, { label: string; value: (l: any) => unknown }> = {
  company: { label: 'Entreprise', value: (l) => l.company },
  contactName: { label: 'Contact', value: (l) => l.contactName },
  contactEmail: { label: 'E-mail', value: (l) => l.contactEmail },
  status: { label: 'Statut', value: (l) => l.status },
  project: { label: 'Plateforme', value: (l) => l.project },
  entity: { label: 'Entité', value: (l) => leadEntityOf(l) },
  source: { label: 'Source', value: (l) => l.source },
  sourceDetail: { label: 'Détail de la source', value: (l) => l.sourceDetail },
  assignedTo: { label: 'Commercial', value: (l) => l.assignedTo?.name ?? '' },
  budget: { label: 'Montant', value: (l) => l.budget },
  probability: { label: 'Probabilité (%)', value: (l) => l.probability },
  // Définition unique de la valeur pondérée : lib/crmRevenue.ts (0 pour un lead fermé, archivé ou sans budget).
  weighted: { label: 'Pondéré', value: (l) => weightedValue(l) },
  expectedCloseAt: {
    label: 'Clôture prévue',
    value: (l) => (l.expectedCloseAt ? new Date(l.expectedCloseAt).toISOString().slice(0, 10) : ''),
  },
  lastInteractionAt: {
    label: 'Dernière interaction',
    value: (l) => (l.lastInteractionAt ? new Date(l.lastInteractionAt).toISOString().slice(0, 10) : ''),
  },
  nextActionLabel: { label: 'Prochaine action', value: (l) => l.nextActionLabel },
  nextActionAt: {
    label: 'Échéance',
    value: (l) => (l.nextActionAt ? new Date(l.nextActionAt).toISOString().slice(0, 10) : ''),
  },
  leadTemperature: { label: 'Température', value: (l) => l.leadTemperature },
  score: { label: 'Score', value: (l) => l.score },
  tags: { label: 'Tags', value: (l) => (l.tags ?? []).join(' | ') },
  sector: { label: 'Secteur', value: (l) => l.sector },
}
const DEFAULT_EXPORT = [
  'company',
  'contactName',
  'contactEmail',
  'status',
  'project',
  'entity',
  'source',
  'assignedTo',
  'budget',
  'probability',
  'weighted',
  'nextActionAt',
]

/** Protège contre l'injection de formules dans un tableur, puis échappe pour le CSV. */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const isId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

export function createCrmExtrasRouter(a: CrmExtrasAdapters): express.Router {
  const router = express.Router()
  const administersRules = (req: Request) => (a.canAdministerRules ? a.canAdministerRules(req) : true)
  const approvesRuns = (req: Request) => (a.canApproveRuns ? a.canApproveRuns(req) : administersRules(req))
  const RULES_ADMIN_MESSAGE = 'La gestion des règles d’automatisation est réservée aux administrateurs du CRM'
  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next)
    }

  // ───────────────── Vues enregistrées ─────────────────
  const viewPayload = (body: Record<string, any>) => {
    const out: Record<string, any> = {}
    if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 80)
    if (['PRIVATE', 'TEAM'].includes(body.scope)) out.scope = body.scope
    if (body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters)) out.filters = body.filters
    if (Array.isArray(body.columns)) out.columns = body.columns.map(String).slice(0, 40)
    if (body.sort === null) out.sort = null
    else if (body.sort && typeof body.sort.key === 'string' && [1, -1].includes(body.sort.dir))
      out.sort = { key: body.sort.key, dir: body.sort.dir }
    if (['table', 'kanban'].includes(body.mode)) out.mode = body.mode
    if (typeof body.pinned === 'boolean') out.pinned = body.pinned
    return out
  }

  router.get(
    '/views',
    ...a.read,
    wrap(async (req, res) => {
      const me = await a.actor(req)
      const items = await CrmView.find({ $or: [{ scope: 'TEAM' }, { owner: me.id }] })
        .sort({ pinned: -1, name: 1 })
        .lean()
      res.json({ items })
    }),
  )

  router.post(
    '/views',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      const me = await a.actor(req)
      const data = viewPayload(req.body || {})
      if (!data.name) return a.fail(res, 400, 'VALIDATION_ERROR', 'Le nom de la vue est requis')
      if (!me.id) return a.fail(res, 400, 'NO_OWNER', 'Aucun propriétaire pour cette vue')
      try {
        const view = await CrmView.create({ ...data, owner: me.id })
        res.status(201).json(view.toObject())
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          return a.fail(res, 409, 'DUPLICATE_VIEW', 'Une vue porte déjà ce nom')
        throw err
      }
    }),
  )

  router.patch(
    '/views/:id',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const me = await a.actor(req)
      const view = await CrmView.findById(req.params.id)
      if (!view) return a.fail(res, 404, 'NOT_FOUND', 'Vue introuvable')
      if (String(view.owner) !== me.id && !me.isSuper)
        return a.fail(res, 403, 'FORBIDDEN', 'Seul le propriétaire modifie cette vue')
      Object.assign(view, viewPayload(req.body || {}))
      try {
        await view.save()
      } catch (err) {
        if ((err as { code?: number }).code === 11000)
          return a.fail(res, 409, 'DUPLICATE_VIEW', 'Une vue porte déjà ce nom')
        throw err
      }
      res.json(view.toObject())
    }),
  )

  router.delete(
    '/views/:id',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const me = await a.actor(req)
      const view = await CrmView.findById(req.params.id)
      if (!view) return a.fail(res, 404, 'NOT_FOUND', 'Vue introuvable')
      if (String(view.owner) !== me.id && !me.isSuper)
        return a.fail(res, 403, 'FORBIDDEN', 'Seul le propriétaire supprime cette vue')
      await view.deleteOne()
      res.json({ ok: true, deletedId: String(view._id) })
    }),
  )

  // ───────────────── Actions groupées ─────────────────
  router.post(
    '/leads/bulk',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      const { ids, action, payload = {}, confirm } = req.body || {}
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isId))
        return a.fail(res, 400, 'VALIDATION_ERROR', 'ids : liste d’identifiants requise')
      if (ids.length > BULK_MAX) return a.fail(res, 400, 'TOO_MANY', `${BULK_MAX} leads au maximum par appel`)
      if (!(BULK_ACTIONS as readonly string[]).includes(action))
        return a.fail(res, 400, 'VALIDATION_ERROR', `action : ${BULK_ACTIONS.join(', ')}`)
      if (action === 'delete' && confirm !== true)
        return a.fail(res, 400, 'CONFIRMATION_REQUIRED', 'La suppression exige confirm: true')
      if (action === 'assign' && !isId(payload.userId))
        return a.fail(res, 400, 'VALIDATION_ERROR', 'payload.userId requis')
      if (action === 'assign' && !(await isAssignableCrmUser(payload.userId))) {
        return a.fail(res, 400, 'VALIDATION_ERROR', 'Commercial introuvable, inactif ou non habilité à suivre un lead')
      }
      if (action === 'status' && !STATUSES.includes(payload.status))
        return a.fail(res, 400, 'VALIDATION_ERROR', 'payload.status invalide')
      const tag = String(payload.tag ?? '')
        .trim()
        .slice(0, 40)
      if (action === 'tag' && !tag) return a.fail(res, 400, 'VALIDATION_ERROR', 'payload.tag requis')

      const settings = await CrmSettings.getSettings()
      const lostReason =
        action === 'status' && payload.status === 'LOST' && typeof payload.lostReason === 'string'
          ? payload.lostReason.trim()
          : undefined
      try {
        assertLostReason(lostReason, settings)
      } catch (err) {
        if (isLeadChangeError(err)) return a.fail(res, 400, 'VALIDATION_ERROR', err.message)
        throw err
      }

      const me = await a.actor(req)
      const scope = a.writeScope(req)
      // Tout passe par le service de lead : historique, automatisations de statut,
      // conversion WON, événements et cascade de suppression identiques à la fiche.
      const change: LeadChangeContext = {
        actor: me.id,
        source: 'bulk',
        settings,
        labelSuffix: '(action groupée)',
        // L'assigné est contrôlé une fois, avant la boucle.
        validateAssignee: false,
      }
      const results: Array<{ id: string; ok: boolean; error?: string }> = []
      for (const id of [...new Set<string>(ids)]) {
        try {
          const lead = await Lead.findOne({ _id: id, ...scope })
          if (!lead) {
            results.push({ id, ok: false, error: 'Lead introuvable' })
            continue
          }
          if (action === 'delete') {
            // Même cascade que la suppression unitaire (service de lead).
            await deleteLeadCascade(lead)
          } else if (action === 'assign') {
            await applyLeadChange(lead, { assignedTo: payload.userId }, change)
          } else if (action === 'status') {
            if (lead.status !== payload.status) {
              await applyLeadChange(
                lead,
                { status: payload.status, ...(lostReason !== undefined ? { lostReason } : {}) },
                change,
              )
            }
          } else if (action === 'tag') {
            const tags: string[] = lead.tags ?? []
            const next =
              payload.mode === 'remove' ? tags.filter((t) => t !== tag) : tags.includes(tag) ? tags : [...tags, tag]
            if (next.length !== tags.length) await applyLeadChange(lead, { tags: next }, change)
          } else if (action === 'archive') {
            await applyLeadChange(lead, { archivedAt: new Date() }, change)
          } else if (action === 'restore') {
            await applyLeadChange(lead, { archivedAt: null }, change)
          }
          results.push({ id, ok: true })
        } catch (err) {
          results.push({ id, ok: false, error: (err as Error).message })
        }
      }
      const okCount = results.filter((r) => r.ok).length
      res.locals.audit = {
        entityType: 'Lead',
        entityId: results[0]?.id ?? '',
        entityRef: `${okCount}/${results.length}`,
        summary: `Action groupée « ${action} » sur ${okCount} lead(s)`,
      }
      res.json({ action, ok: okCount, failed: results.length - okCount, results })
    }),
  )

  // ───────────────── Export CSV ─────────────────
  router.get(
    '/leads/export',
    ...a.read,
    wrap(async (req, res) => {
      const requested = typeof req.query.columns === 'string' ? req.query.columns.split(',').map((c) => c.trim()) : []
      const columns = (requested.length ? requested : DEFAULT_EXPORT).filter((c) => c in EXPORT_COLUMNS)
      if (columns.length === 0)
        return a.fail(res, 400, 'VALIDATION_ERROR', `columns : ${Object.keys(EXPORT_COLUMNS).join(', ')}`)
      const filter: Record<string, unknown> = {
        ...a.leadScope(req),
        archivedAt: req.query.archived === 'true' ? { $ne: null } : null,
      }
      if (typeof req.query.status === 'string' && STATUSES.includes(req.query.status)) filter.status = req.query.status
      if (isGroupEntity(req.query.entity)) {
        const allowed = a.entityScope?.(req) ?? null
        filter.entity =
          allowed === null || allowed.includes(req.query.entity) ? entityCondition([req.query.entity]) : { $in: [] }
      }
      if (typeof req.query.ids === 'string' && req.query.ids) {
        filter._id = { $in: req.query.ids.split(',').filter(isId).slice(0, 1000) }
      }
      // Une ligne de plus que le plafond : on sait s'il a été atteint sans compter toute la base.
      const fetched = await Lead.find(filter)
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 })
        .limit(EXPORT_MAX_ROWS + 1)
        .lean()
      const truncated = fetched.length > EXPORT_MAX_ROWS
      const leads = truncated ? fetched.slice(0, EXPORT_MAX_ROWS) : fetched
      const rows = [columns.map((c) => csvCell(EXPORT_COLUMNS[c].label)).join(';')]
      for (const lead of leads) rows.push(columns.map((c) => csvCell(EXPORT_COLUMNS[c].value(lead))).join(';'))

      // RGPD : un export sort des données personnelles de l'application ; il est tracé (qui, quand, quoi, combien).
      const me = await a.actor(req)
      const actor = buildActorFromReq(req)
      await recordAudit({
        action: 'CRM_LEADS_EXPORT',
        actor: {
          ...actor,
          type: actor.type === 'SYSTEM' && me.id ? 'USER' : actor.type,
          userId: actor.userId || me.id || undefined,
        },
        entityType: 'Lead',
        summary: `Export CSV de ${leads.length} lead(s)${truncated ? ' (tronqué)' : ''}`,
        extra: {
          rows: leads.length,
          truncated,
          columns,
          filters: {
            archived: req.query.archived === 'true',
            status: typeof req.query.status === 'string' ? req.query.status : null,
            entity: typeof req.query.entity === 'string' ? req.query.entity : null,
            ids: typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',').length : 0,
          },
          ...(req.agentToken?.id ? { channel: 'agent', tokenId: String(req.agentToken.id) } : { channel: 'admin' }),
        },
      })

      if (truncated) res.setHeader('X-Export-Truncated', String(EXPORT_MAX_ROWS))
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="crm-leads.csv"')
      res.send('﻿' + rows.join('\r\n'))
    }),
  )

  // ───────────────── Fiche lead ─────────────────
  const loadLead = async (req: Request, res: Response) => {
    if (!isId(req.params.id)) {
      a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      return null
    }
    const lead = await Lead.findOne({ _id: req.params.id, ...a.leadScope(req) }).select('_id company')
    if (!lead) a.fail(res, 404, 'NOT_FOUND', 'Lead introuvable')
    return lead
  }

  router.get(
    '/leads/:id/timeline',
    ...a.read,
    wrap(async (req, res) => {
      const lead = await loadLead(req, res)
      if (!lead) return
      const [{ entries, hasMore }, runs] = await Promise.all([
        buildTimeline('LEAD', lead._id),
        CrmRuleRun.find({ lead: lead._id, status: { $ne: 'SIM' } })
          .sort({ createdAt: -1 })
          .limit(30)
          .lean(),
      ])
      res.json({ entries, hasMore, runs })
    }),
  )

  router.get(
    '/leads/:id/tasks',
    ...a.read,
    wrap(async (req, res) => {
      const lead = await loadLead(req, res)
      if (!lead) return
      const items = await PersonalTask.find({ leadId: lead._id, isArchived: false })
        .populate('userId', 'name')
        .sort({ status: 1, dueDate: 1 })
        .lean()
      res.json({ items })
    }),
  )

  router.get(
    '/leads/:id/documents',
    ...a.read,
    wrap(async (req, res) => {
      const lead = await loadLead(req, res)
      if (!lead) return
      const [quotes, projects] = await Promise.all([
        QuoteProposal.find({ leadId: lead._id })
          .select('title reference status expiresAt createdAt')
          .sort({ createdAt: -1 })
          .lean(),
        Project.find({ sourceLead: lead._id }).select('name status').lean(),
      ])
      res.json({ quotes, projects })
    }),
  )

  // ───────────────── Règles d'automatisation ─────────────────
  router.get(
    '/rules/catalog',
    ...a.read,
    wrap(async (_req, res) => {
      res.json({
        triggers: RULE_TRIGGERS,
        actions: RULE_ACTIONS,
        fields: CONDITION_FIELDS,
        operators: CONDITION_OPERATORS,
        maxDepth: 3,
      })
    }),
  )

  const rulePayload = (body: Record<string, any>) => {
    const out: Record<string, any> = {}
    if (typeof body.name === 'string') out.name = body.name.trim().slice(0, 120)
    if (typeof body.description === 'string') out.description = body.description.slice(0, 500)
    if (body.trigger && (RULE_TRIGGERS as readonly string[]).includes(body.trigger.type)) {
      out.trigger = {
        type: body.trigger.type,
        params: body.trigger.params && typeof body.trigger.params === 'object' ? body.trigger.params : {},
      }
    }
    if (body.conditions && Array.isArray(body.conditions.items)) {
      out.conditions = {
        op: body.conditions.op === 'OR' ? 'OR' : 'AND',
        items: body.conditions.items
          .filter(
            (c: any) =>
              (CONDITION_FIELDS as readonly string[]).includes(c?.field) &&
              (CONDITION_OPERATORS as readonly string[]).includes(c?.operator),
          )
          .slice(0, 10)
          .map((c: any) => ({ field: c.field, operator: c.operator, value: c.value })),
      }
    }
    if (Array.isArray(body.actions)) {
      out.actions = body.actions
        .filter((x: any) => (RULE_ACTIONS as readonly string[]).includes(x?.type))
        .slice(0, 8)
        .map((x: any) => ({ type: x.type, params: x.params && typeof x.params === 'object' ? x.params : {} }))
    }
    if (body.limits && typeof body.limits === 'object') {
      out.limits = {
        perLead: ['ONCE', 'DAYS', 'NONE'].includes(body.limits.perLead) ? body.limits.perLead : 'DAYS',
        days: Math.min(365, Math.max(1, Number(body.limits.days) || 7)),
        maxPerRun: Math.min(500, Math.max(1, Number(body.limits.maxPerRun) || 50)),
      }
    }
    if (typeof body.requireApproval === 'boolean') out.requireApproval = body.requireApproval
    return out
  }

  router.get(
    '/rules',
    ...a.read,
    wrap(async (_req, res) => {
      const items = await CrmRule.find().sort({ system: -1, createdAt: 1 }).lean()
      res.json({ items })
    }),
  )

  router.post(
    '/rules',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!administersRules(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', RULES_ADMIN_MESSAGE)
      const data = rulePayload(req.body || {})
      if (!data.name || !data.trigger || !data.actions?.length)
        return a.fail(res, 400, 'VALIDATION_ERROR', 'name, trigger et au moins une action sont requis')
      const me = await a.actor(req)
      // Une règle naît toujours en brouillon : l'activation est un acte distinct.
      const rule = await CrmRule.create({ ...data, status: 'DRAFT', createdBy: me.id })
      res.status(201).json(rule.toObject())
    }),
  )

  router.get(
    '/rules/runs',
    ...a.read,
    wrap(async (req, res) => {
      const filter: Record<string, unknown> = {}
      if (typeof req.query.status === 'string' && ['OK', 'ERR', 'SKIP', 'SIM', 'PENDING'].includes(req.query.status))
        filter.status = req.query.status
      if (isId(req.query.rule)) filter.rule = req.query.rule
      if (isId(req.query.lead)) filter.lead = req.query.lead
      // Le journal ne montre que les exécutions portant sur des leads lisibles.
      const scope = a.leadScope(req)
      if (Object.keys(scope).length > 0) {
        const readable = await Lead.distinct('_id', scope)
        filter.$and = [{ lead: { $in: readable } }]
      }
      const page = Math.max(1, Number(req.query.page) || 1)
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50))
      const [items, total] = await Promise.all([
        CrmRuleRun.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        CrmRuleRun.countDocuments(filter),
      ])
      res.json({ items, page, pageSize, total })
    }),
  )

  const runAction = (fn: (id: string, actorId: string | null) => Promise<unknown>, label: string) => [
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!approvesRuns(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', RULES_ADMIN_MESSAGE)
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const me = await a.actor(req)
      const run = await fn(req.params.id, me.id)
      if (!run) return a.fail(res, 409, 'NOT_APPLICABLE', `Exécution introuvable ou non ${label}`)
      res.json(run)
    }),
  ]
  router.post(
    '/rules/runs/:id/approve',
    ...runAction((id, actor) => approveRun(id, actor ?? ''), 'en attente de validation'),
  )
  router.post('/rules/runs/:id/reject', ...runAction((id) => rejectRun(id), 'en attente de validation'))
  router.post('/rules/runs/:id/retry', ...runAction((id) => retryRun(id), 'en erreur'))

  router.get(
    '/rules/:id',
    ...a.read,
    wrap(async (req, res) => {
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const rule = await CrmRule.findById(req.params.id).lean()
      if (!rule) return a.fail(res, 404, 'NOT_FOUND', 'Règle introuvable')
      res.json(rule)
    }),
  )

  router.patch(
    '/rules/:id',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!administersRules(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', RULES_ADMIN_MESSAGE)
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const rule = await CrmRule.findById(req.params.id)
      if (!rule) return a.fail(res, 404, 'NOT_FOUND', 'Règle introuvable')
      const data = rulePayload(req.body || {})
      const nextStatus = req.body?.status
      if (nextStatus !== undefined) {
        if (!['DRAFT', 'ACTIVE', 'PAUSED'].includes(nextStatus))
          return a.fail(res, 400, 'VALIDATION_ERROR', 'status invalide')
        if (nextStatus === 'ACTIVE' && !a.canActivateRules(req)) {
          return a.fail(
            res,
            403,
            'ACTIVATION_REQUIRES_HUMAN',
            'L’activation d’une règle exige un utilisateur ou un token admin:*',
          )
        }
        data.status = nextStatus
      }
      // Modifier le contenu d'une règle active la repasse en pause tant qu'un humain ne la réactive pas.
      if (rule.status === 'ACTIVE' && !a.canActivateRules(req) && (data.actions || data.trigger || data.conditions))
        data.status = 'PAUSED'
      if (rule.system && (data.trigger || data.actions))
        return a.fail(res, 409, 'SYSTEM_RULE', 'Une règle système n’est pas modifiable ; dupliquez-la')
      Object.assign(rule, data)
      await rule.save()
      res.json(rule.toObject())
    }),
  )

  router.delete(
    '/rules/:id',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!administersRules(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', RULES_ADMIN_MESSAGE)
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const rule = await CrmRule.findById(req.params.id)
      if (!rule) return a.fail(res, 404, 'NOT_FOUND', 'Règle introuvable')
      if (rule.system)
        return a.fail(res, 409, 'SYSTEM_RULE', 'Une règle système se met en pause, elle ne se supprime pas')
      await rule.deleteOne()
      res.json({ ok: true, deletedId: String(rule._id) })
    }),
  )

  router.post(
    '/rules/:id/simulate',
    ...a.write,
    ...a.idem,
    wrap(async (req, res) => {
      if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      const rule = await CrmRule.findById(req.params.id)
      if (!rule) return a.fail(res, 404, 'NOT_FOUND', 'Règle introuvable')
      res.json(await simulateRule(rule, { record: req.body?.record === true }))
    }),
  )

  // ───────────────── Séquences d'e-mails (lot 5) ─────────────────
  router.use(createCrmSequencesRouter(a))

  return router
}
