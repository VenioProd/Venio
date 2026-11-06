import { readableProjectIds, canReadProject } from '../../lib/adminProjectAccess.js'
import express, { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Lead, { LEAD_PROJECTS } from '../../models/Lead.js'
import LeadActivity from '../../models/LeadActivity.js'
import User from '../../models/User.js'
import CrmSettings from '../../models/CrmSettings.js'
import { ADMIN_ROLES, PERMISSIONS } from '../../lib/permissions.js'
import { getRoundRobinAssignee, logLeadActivity, checkDuplicateLead, buildWorklist } from '../../lib/crmAutomations.js'
import { ensureClientForWonLead } from '../../lib/crmClientConversion.js'
import {
  applyLeadChange,
  createLead,
  deleteLeadCascade,
  isLeadChangeError,
  normalizeLeadPatch,
} from '../../lib/crmLeadService.js'
import logger from '../../lib/logger.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import {
  administersCrm,
  canReadLead,
  isAssignableCrmUser,
  leadScopeFilter,
  isLeadOutOfScope,
  readsWholeCrm,
} from '../../lib/crmScope.js'
import { summariseRevenue, weightedPipeline, type RevenueDocument } from '../../lib/crmRevenue.js'
import Project from '../../models/Project.js'
import BillingDocument from '../../models/BillingDocument.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import {
  assessCoverage,
  buildFunnel,
  buildLossBreakdown,
  computeVelocity,
  groupPerformance,
  type PilotageLead,
  type StatusTransition,
} from '../../lib/crmPilotage.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// Un identifiant de lead mal formé est une erreur de requête (400), pas une erreur serveur (500).
router.param('id', (_req: Request, res: Response, next: NextFunction, id: string) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Identifiant invalide' })
  return next()
})

const CRM_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
const DEFAULT_FOLLOW_UP_DAYS = 3


// List leads with filters
router.get(
  '/leads',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = leadScopeFilter(req)
      const filter: Record<string, unknown> = { ...scope, archivedAt: req.query.archived === 'true' ? { $ne: null } : null }
      if (typeof req.query.tag === 'string' && req.query.tag) filter.tags = req.query.tag
      if (req.query.status && CRM_STATUSES.includes(req.query.status as string)) filter.status = req.query.status
      if (req.query.assignedTo && req.user!.role === 'SUPER_ADMIN') filter.assignedTo = req.query.assignedTo
      if (typeof req.query.project === 'string' && (LEAD_PROJECTS as readonly string[]).includes(req.query.project)) {
        filter.project = req.query.project
      }
      if (req.query.search) {
        const q = String(req.query.search)
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const searchOr = [
          { company: { $regex: q, $options: 'i' } },
          { contactName: { $regex: q, $options: 'i' } },
          { contactEmail: { $regex: q, $options: 'i' } },
        ]
        // Merge search $or with scope $or using $and
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or as Record<string, unknown>[] }, { $or: searchOr }]
          delete filter.$or
        } else {
          filter.$or = searchOr
        }
      }
      const leads = await Lead.find(filter).sort({ updatedAt: -1 })
      return res.json({ leads })
    } catch (err) {
      return next(err)
    }
  },
)

// Pipeline grouped by status
router.get(
  '/pipeline',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leads = await Lead.find({ ...leadScopeFilter(req), archivedAt: null }).sort({ updatedAt: -1 })
      const columns = CRM_STATUSES.map((status) => ({
        status,
        leads: leads.filter((lead) => lead.status === status),
      }))
      return res.json({ columns })
    } catch (err) {
      return next(err)
    }
  },
)

// Create lead
router.post(
  '/leads',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  idempotentRequest,
  body('company').trim().notEmpty().withMessage("Le nom de l'entreprise est requis"),
  body('contactEmail').optional({ values: 'falsy' }).isEmail().withMessage('Email de contact invalide'),
  body('project')
    .optional({ values: 'falsy' })
    .isIn([...LEAD_PROJECTS])
    .withMessage('Projet invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const payload: Record<string, any> = normalizeLeadPatch(req.body || {})

      // Un lead ne se confie qu'à un membre actif de l'équipe habilité à le suivre.
      // Seul l'assigné choisi est contrôlé : l'attribution par défaut (soi-même,
      // tourniquet) garde son comportement historique.
      if (payload.assignedTo && !(await isAssignableCrmUser(payload.assignedTo))) {
        return res.status(400).json({ error: 'Commercial introuvable, inactif ou non habilité à suivre un lead' })
      }

      const settings = await CrmSettings.getSettings()

      // Auto-assign to self for non-SUPER_ADMIN
      if (!payload.assignedTo && req.user!.role !== 'SUPER_ADMIN') {
        payload.assignedTo = req.user!.id
      }
      // Round-robin assignment (if enabled and still no assignee)
      if (!payload.assignedTo && settings.roundRobinEnabled) {
        payload.assignedTo = await getRoundRobinAssignee()
      }
      payload.createdBy = req.user!.id

      // Historique, automatisations de statut, auto-qualification, score,
      // conversion WON et événements : tout passe par le service.
      const { lead } = await createLead(payload, {
        actor: req.user!.id,
        source: 'admin',
        settings,
        validateAssignee: false,
      })
      return res.status(201).json({ lead })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, ...err.details })
      return next(err)
    }
  },
)

// Update lead
router.patch(
  '/leads/:id',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  idempotentRequest,
  body('project')
    .optional({ values: 'falsy' })
    .isIn([...LEAD_PROJECTS])
    .withMessage('Projet invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }
      const lead = await Lead.findById(req.params.id)
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      if (isLeadOutOfScope(req, lead)) {
        return res.status(404).json({ error: 'Lead not found' })
      }

      const oldAssignee = lead.assignedTo?.toString() || null
      const payload = normalizeLeadPatch(req.body || {})

      // Le lead d'un collègue ne se reprend pas : l'assignation ouvre des
      // droits (devis), et en être le créateur ne suffit pas pour la changer.
      if (
        payload.assignedTo !== undefined &&
        req.user!.role !== 'SUPER_ADMIN' &&
        oldAssignee &&
        oldAssignee !== req.user!.id &&
        String(payload.assignedTo ?? '') !== oldAssignee
      ) {
        return res.status(403).json({
          error: 'Seul le titulaire du lead ou un super-admin peut le réassigner',
          code: 'LEAD_ASSIGNMENT_FORBIDDEN',
        })
      }

      // Le service refuse un motif de perte hors liste et un assigné non
      // habilité (400), avant toute écriture.
      const result = await applyLeadChange(lead, payload, { actor: req.user!.id, source: 'admin' })
      return res.json({ lead: result.lead })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, ...err.details })
      return next(err)
    }
  },
)

// Get single lead
router.get(
  '/leads/:id',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findById(req.params.id)
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      if (!canReadLead(req, lead)) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      return res.json({ lead })
    } catch (err) {
      return next(err)
    }
  },
)

// Delete lead
router.delete(
  '/leads/:id',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findById(req.params.id)
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      if (isLeadOutOfScope(req, lead)) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      // Historique, échanges, tâches et exécutions de règles partent avec le lead.
      await deleteLeadCascade(lead)
      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  },
)

// Get lead activities (history)
router.get(
  '/leads/:id/activities',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findById(req.params.id).select('assignedTo createdBy')
      if (!lead || !canReadLead(req, lead)) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      const activities = await LeadActivity.find({ leadId: req.params.id })
        .sort({ createdAt: -1 })
        .populate('actorId', 'name email')
      return res.json({ activities })
    } catch (err) {
      return next(err)
    }
  },
)

// ─── Chaîne lead → devis → chiffre d'affaires ────────────────────────────────

/** Charge le lead en vérifiant son existence et le périmètre de l'utilisateur. */
async function loadLeadInScope(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id).select('company clientAccountId assignedTo createdBy budget')
  if (!lead || isLeadOutOfScope(req, lead)) {
    res.status(404).json({ error: 'Lead not found' })
    return null
  }
  return lead
}

/** Ce que ce lead a réellement produit : projets rattachés, devis, factures. */
router.get(
  '/leads/:id/revenue',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findOne({ _id: req.params.id, ...leadScopeFilter(req) }).select('company budget')
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      const ids = await readableProjectIds(req.user!)
      const projects = await Project.find({ sourceLead: lead._id, ...(ids === null ? {} : { _id: { $in: ids } }) })
        .select('name status createdAt')
        .lean()
      const projectIds = projects.map((project) => project._id)

      const [documents, proposals] = await Promise.all([
        projectIds.length === 0
          ? Promise.resolve([])
          : BillingDocument.find({ project: { $in: projectIds } })
              .select('type number status total currency issuedAt paidAt project')
              .sort({ issuedAt: -1 })
              .lean(),
        projectIds.length === 0
          ? Promise.resolve([])
          : QuoteProposal.find({ project: { $in: projectIds } })
              .select('title status project billingDocument createdAt')
              .sort({ createdAt: -1 })
              .lean(),
      ])

      return res.json({
        lead: { _id: String(lead._id), company: lead.company, budget: lead.budget ?? null },
        projects,
        proposals,
        documents,
        summary: summariseRevenue(documents as unknown as RevenueDocument[]),
      })
    } catch (err) {
      return next(err)
    }
  },
)

/**
 * Projets du même client encore rattachés à aucun lead. Rien n'est deviné : un
 * rapprochement automatique se tromperait dès qu'un client a eu plusieurs
 * affaires, et un lien faux propage du chiffre d'affaires sur le mauvais lead.
 */
router.get(
  '/leads/:id/project-candidates',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findOne({ _id: req.params.id, ...leadScopeFilter(req) }).select('clientAccountId')
      if (!lead) return res.status(404).json({ error: 'Lead not found' })

      if (!lead.clientAccountId) {
        return res.json({ candidates: [], reason: 'NO_CLIENT_ACCOUNT' })
      }

      const ids = await readableProjectIds(req.user!)
      const candidates = await Project.find({
        ...(ids === null ? {} : { _id: { $in: ids } }),
        client: lead.clientAccountId,
        $or: [{ sourceLead: null }, { sourceLead: { $exists: false } }],
      })
        .select('name status createdAt')
        .sort({ createdAt: -1 })
        .lean()

      return res.json({ candidates })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/leads/:id/projects/:projectId',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await loadLeadInScope(req, res)
      if (!lead) return undefined

      if (!mongoose.isValidObjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Identifiant de projet invalide' })
      }
      if (!(await canReadProject(req.user!, String(req.params.projectId)))) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }
      const project = await Project.findById(req.params.projectId).select('name sourceLead')
      if (!project) return res.status(404).json({ error: 'Project not found' })

      // Écraser un rattachement existant déplacerait du chiffre d'affaires d'un
      // lead à un autre, en silence.
      if (project.sourceLead && String(project.sourceLead) !== String(lead._id)) {
        return res.status(409).json({ error: 'Ce projet est déjà rattaché à un autre lead' })
      }

      project.sourceLead = lead._id as mongoose.Types.ObjectId
      await project.save()

      // L'attribution du chiffre d'affaires est une décision humaine : elle se trace.
      await logLeadActivity(
        lead._id,
        'PROJECT_LINKED',
        `Projet "${project.name}" rattaché à ce lead`,
        { projectId: String(project._id) },
        req.user!.id,
      )

      return res.json({ success: true, project: { _id: String(project._id), name: project.name } })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/leads/:id/projects/:projectId',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await loadLeadInScope(req, res)
      if (!lead) return undefined

      if (!mongoose.isValidObjectId(req.params.projectId)) {
        return res.status(400).json({ error: 'Identifiant de projet invalide' })
      }
      if (!(await canReadProject(req.user!, String(req.params.projectId)))) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }
      const project = await Project.findOne({ _id: req.params.projectId, sourceLead: lead._id }).select('name')
      if (!project) return res.status(404).json({ error: 'Project not found' })

      await Project.updateOne({ _id: project._id }, { $set: { sourceLead: null } })
      await logLeadActivity(
        lead._id,
        'PROJECT_UNLINKED',
        `Projet "${project.name}" détaché de ce lead`,
        { projectId: String(project._id) },
        req.user!.id,
      )

      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  },
)

// ─── Pilotage commercial ─────────────────────────────────────────────────────

const PILOTAGE_PERIODS: Record<string, number> = { '30d': 30, '90d': 90, '12m': 365 }
const DEFAULT_PILOTAGE_PERIOD = '90d'

/** Début de la fenêtre d'analyse. `ytd` part du 1er janvier de l'année courante. */
function resolvePeriod(raw: unknown, now: Date): { period: string; since: Date } {
  const period = typeof raw === 'string' && (raw === 'ytd' || raw in PILOTAGE_PERIODS) ? raw : DEFAULT_PILOTAGE_PERIOD
  if (period === 'ytd') return { period, since: new Date(now.getFullYear(), 0, 1) }
  const since = new Date(now)
  since.setDate(since.getDate() - PILOTAGE_PERIODS[period]!)
  return { period, since }
}

router.get(
  '/pilotage',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date()
      const { period, since } = resolvePeriod(req.query.period, now)
      const seesEveryone = readsWholeCrm(req)

      // Cohorte : les leads CRÉÉS dans la fenêtre. Un taux de conversion mesuré
      // sur deux populations différentes ne veut rien dire — c'est l'erreur que
      // corrige ce chantier.
      const leadDocs = await Lead.find({ createdAt: { $gte: since }, ...leadScopeFilter(req) })
        .select('status createdAt source budget assignedTo lostReason')
        .lean()

      const leads: PilotageLead[] = leadDocs.map((lead) => ({
        _id: String(lead._id),
        status: lead.status,
        createdAt: lead.createdAt,
        source: lead.source,
        budget: lead.budget,
        assignedTo: lead.assignedTo ? String(lead.assignedTo) : null,
        lostReason: lead.lostReason,
      }))

      const activities = await LeadActivity.find({
        leadId: { $in: leadDocs.map((lead) => lead._id) },
        type: 'STATUS_CHANGE',
      })
        .select('leadId payload createdAt')
        .lean()

      const transitions: StatusTransition[] = activities
        .map((activity) => {
          const payload = (activity.payload ?? {}) as { from?: unknown; to?: unknown }
          return {
            leadId: String(activity.leadId),
            from: String(payload.from ?? ''),
            to: String(payload.to ?? ''),
            at: activity.createdAt,
          }
        })
        .filter((transition) => transition.from && transition.to)

      const funnel = buildFunnel(leads, transitions)

      // Chiffre d'affaires réellement produit par la cohorte, via les projets
      // qui lui sont rattachés. Le budget déclaré est renvoyé en regard :
      // l'écart entre annoncé et signé est ce que le CRM n'a jamais su dire.
      const ids = await readableProjectIds(req.user!)
      const cohortProjects = await Project.find({
        ...(ids === null ? {} : { _id: { $in: ids } }),
        sourceLead: { $in: leadDocs.map((lead) => lead._id) },
      })
        .select('_id sourceLead')
        .lean()
      const cohortDocuments =
        cohortProjects.length === 0
          ? []
          : await BillingDocument.find({ project: { $in: cohortProjects.map((project) => project._id) } })
              .select('type status total project')
              .lean()

      // Montant signé par lead, pour confronter le budget déclaré au réel dans
      // les ventilations par source et par commercial.
      const leadByProject = new Map(cohortProjects.map((project) => [String(project._id), String(project.sourceLead)]))
      const signedByLead = new Map<string, number>()
      for (const document of cohortDocuments) {
        const leadId = leadByProject.get(String(document.project))
        if (!leadId) continue
        const { signed } = summariseRevenue([document as unknown as RevenueDocument])
        if (signed > 0) signedByLead.set(leadId, (signedByLead.get(leadId) ?? 0) + signed)
      }

      const declaredBudget = leads.reduce((sum, lead) => sum + (lead.budget ?? 0), 0)

      return res.json({
        period,
        since: since.toISOString(),
        funnel,
        revenue: {
          declaredBudget,
          linkedProjects: cohortProjects.length,
          ...summariseRevenue(cohortDocuments as unknown as RevenueDocument[]),
        },
        // Le pipeline porte sur les affaires EN COURS, quelle que soit leur
        // date de création : ce n'est pas la cohorte, seulement ses taux.
        pipeline: weightedPipeline(
          (
            await Lead.find({ status: { $nin: ['WON', 'LOST'] }, ...leadScopeFilter(req) })
              .select('status createdAt budget')
              .lean()
          ).map((lead) => ({
            _id: String(lead._id),
            status: lead.status,
            createdAt: lead.createdAt,
            budget: lead.budget,
          })),
          funnel,
        ),
        velocity: computeVelocity(leads, transitions),
        losses: buildLossBreakdown(leads, transitions),
        bySource: groupPerformance(leads, 'source', signedByLead),
        // Ventiler par personne n'a de sens que pour qui voit tout le monde :
        // sur un périmètre restreint, la table n'aurait qu'une ligne et
        // suggérerait une comparaison qui n'existe pas.
        byOwner: seesEveryone ? groupPerformance(leads, 'assignedTo', signedByLead) : null,
        coverage: assessCoverage(leads, transitions),
      })
    } catch (err) {
      return next(err)
    }
  },
)

// File de travail commerciale : échéances (en retard, aujourd'hui, à venir) et
// signaux de dérive (froid, bloqué), groupés selon les seuils configurés.
// Remplace l'ancien GET /alerts, qui codait ses seuils en dur et n'était
// consommé par aucun client.
router.get(
  '/worklist',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await CrmSettings.getSettings()
      const leads = await Lead.find({ status: { $nin: ['WON', 'LOST'] }, ...leadScopeFilter(req) }).lean()

      const thresholds = {
        coldEnabled: settings.coldLeadAlertEnabled,
        coldDays: settings.coldLeadThresholdDays,
        overdueEnabled: settings.overdueAlertEnabled,
        staleEnabled: settings.staleLeadAlertEnabled,
        staleDays: settings.staleLeadThresholdDays,
      }

      const groups = buildWorklist(leads, {
        coldLeadAlertEnabled: thresholds.coldEnabled,
        coldLeadThresholdDays: thresholds.coldDays,
        overdueAlertEnabled: thresholds.overdueEnabled,
        staleLeadAlertEnabled: thresholds.staleEnabled,
        staleLeadThresholdDays: thresholds.staleDays,
      })

      return res.json({
        groups,
        thresholds,
        // Motifs de perte proposés par le dialogue de clôture. Servis ici
        // plutôt que via /crm/settings, réservé à MANAGE_CRM : les lire ne
        // devrait pas exiger le droit de les modifier.
        lostReasons: settings.lostReasons,
        // Délais de relance pré-remplis par la file quand on marque un lead
        // contacté : mêmes réglages que les automatisations de statut.
        followUp: {
          demoDays: settings.demoFollowUpDays,
          proposalDays: settings.proposalFollowUpDays,
          defaultDays: DEFAULT_FOLLOW_UP_DAYS,
        },
        counts: {
          overdue: groups.overdue.length,
          today: groups.today.length,
          upcoming: groups.upcoming.length,
          drifting: groups.drifting.length,
        },
      })
    } catch (err) {
      return next(err)
    }
  },
)

// Convert WON lead to client
router.post(
  '/leads/:id/convert-to-client',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await CrmSettings.getSettings()
      const lead = await Lead.findById(req.params.id)
      if (!lead || isLeadOutOfScope(req, lead)) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      if (lead.status !== 'WON') {
        return res.status(400).json({ error: 'Only WON leads can be converted to clients' })
      }
      const alreadyLinked = Boolean(lead.clientAccountId)
      const linked = await ensureClientForWonLead(lead, req.user!.id, settings.activityLogging)
      // Le compte est relu sans ses secrets : le document chargé porte le hash
      // du mot de passe et le second facteur.
      const client = await User.findById(linked._id)
        .select('-passwordHash -twoFactorSecret -twoFactorRecoveryCodeHashes')
        .lean()
      return res.status(alreadyLinked ? 200 : 201).json({ client, lead })
    } catch (err) {
      return next(err)
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// CRM SETTINGS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get CRM settings
router.get(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await CrmSettings.getSettings()
      return res.json({ settings })
    } catch (err) {
      return next(err)
    }
  },
)

/** Domaines dont les adresses peuvent recevoir le rapport hebdomadaire sans être un compte de l'équipe. */
function reportAllowedDomains(): string[] {
  return (process.env.CRM_REPORT_ALLOWED_DOMAINS ?? 'venio.paris')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

const REPORT_RECIPIENTS_MAX = 20
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Le rapport hebdomadaire part hors de l'application : ses destinataires sont
 * des comptes actifs de l'équipe, ou des adresses du domaine de l'entreprise.
 */
async function validateReportRecipients(value: unknown): Promise<{ ok: true; emails: string[] } | { ok: false; error: string }> {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    return { ok: false, error: 'weeklyReportRecipients : liste d’adresses e-mail attendue' }
  }
  const emails = [...new Set(value.map((v) => v.trim().toLowerCase()).filter(Boolean))]
  if (emails.length > REPORT_RECIPIENTS_MAX) {
    return { ok: false, error: `${REPORT_RECIPIENTS_MAX} destinataires au maximum pour le rapport hebdomadaire` }
  }
  const malformed = emails.filter((e) => !SIMPLE_EMAIL.test(e))
  if (malformed.length) return { ok: false, error: `Adresse invalide : ${malformed.join(', ')}` }
  const domains = reportAllowedDomains()
  const outsideDomain = emails.filter((e) => !domains.includes(e.slice(e.lastIndexOf('@') + 1)))
  const staff = outsideDomain.length
    ? await User.find({ email: { $in: outsideDomain }, role: { $in: ADMIN_ROLES }, isActive: true }).select('email').lean()
    : []
  const staffEmails = new Set(staff.map((u) => u.email))
  const rejected = outsideDomain.filter((e) => !staffEmails.has(e))
  if (rejected.length) {
    return {
      ok: false,
      error: `Destinataire non autorisé (ni membre actif de l’équipe, ni adresse de l’entreprise) : ${rejected.join(', ')}`,
    }
  }
  return { ok: true, emails }
}

/** Champs dont la valeur est contrôlée : ils ne se modifient qu'entiers, jamais par chemin pointé. */
const GUARDED_SETTINGS = ['weeklyReportRecipients', 'escalationManagerId', 'defaultCloserId']

// Update CRM settings
router.patch(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Les réglages s'appliquent à tout le groupe : réservés aux administrateurs du CRM.
      if (!administersCrm(req)) {
        return res.status(403).json({ error: 'Les réglages du CRM sont réservés aux administrateurs', code: 'CRM_ADMIN_REQUIRED' })
      }
      const updates = req.body || {}
      // Remove fields that shouldn't be updated directly
      delete updates._id
      delete updates.createdAt
      delete updates.updatedAt

      const dotted = Object.keys(updates).find((key) => GUARDED_SETTINGS.some((field) => key.startsWith(`${field}.`)))
      if (dotted) return res.status(400).json({ error: `${dotted} : ce réglage se modifie en entier` })

      if (updates.weeklyReportRecipients !== undefined) {
        const check = await validateReportRecipients(updates.weeklyReportRecipients)
        if (!check.ok) return res.status(400).json({ error: check.error })
        updates.weeklyReportRecipients = check.emails
      }

      // Le responsable d'escalade reçoit les alertes : un membre actif de l'équipe, ou personne.
      if (updates.escalationManagerId !== undefined) {
        const managerId = updates.escalationManagerId || null
        const manager =
          typeof managerId === 'string' && mongoose.isObjectIdOrHexString(managerId)
            ? await User.exists({ _id: managerId, role: { $in: ADMIN_ROLES }, isActive: true })
            : null
        if (managerId && !manager) {
          return res.status(400).json({ error: 'Le responsable d’escalade doit être un membre actif de l’équipe' })
        }
        updates.escalationManagerId = managerId
      }

      // Le closer reçoit les dossiers des externes : un membre actif de l'équipe, ou personne.
      if (updates.defaultCloserId !== undefined) {
        const closerId = updates.defaultCloserId || null
        const closer =
          closerId && mongoose.isObjectIdOrHexString(closerId)
            ? await User.exists({ _id: closerId, role: { $in: ADMIN_ROLES }, isActive: true })
            : null
        if (closerId && !closer) {
          return res.status(400).json({ error: 'Le closer doit être un membre actif de l’équipe' })
        }
        updates.defaultCloserId = closerId
      }

      const settings = await CrmSettings.updateSettings(updates)
      return res.json({ settings })
    } catch (err) {
      return next(err)
    }
  },
)

// Check for duplicate leads
router.post(
  '/check-duplicate',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await CrmSettings.getSettings()
      if (!settings.duplicateDetectionEnabled) {
        return res.json({ duplicates: [], enabled: false })
      }

      const { company, contactEmail, contactPhone, excludeId } = req.body
      const found = await checkDuplicateLead({ company, contactEmail, contactPhone }, settings, excludeId)
      // Seuls les doublons du périmètre de lecture sont renvoyés : la détection ne doit pas
      // révéler les leads d'un collègue.
      let duplicates = found
      if (!readsWholeCrm(req) && found.length > 0) {
        const readable = await Lead.distinct('_id', { _id: { $in: found.map((d) => d._id) }, ...leadScopeFilter(req) })
        const readableIds = new Set(readable.map(String))
        duplicates = found.filter((d) => readableIds.has(String(d._id)))
      }
      return res.json({ duplicates, enabled: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
