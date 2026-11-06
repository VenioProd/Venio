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
import { mergeLeads } from '../../lib/crmLeadMerge.js'
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
  applyEntityQuery,
  canReadLead,
  crmEntityRestriction,
  isAssignableCrmUser,
  LEAD_SCOPE_FIELDS,
  leadScopeFilter,
  isLeadOutOfScope,
  readsUnrestrictedCrm,
  readsWholeCrm,
  resolveWriteEntity,
} from '../../lib/crmScope.js'
import { GROUP_ENTITIES, isGroupEntity, leadEntityOf } from '../../lib/groupEntities.js'
import { anonymizeLead, buildPersonalDataExport, isEmailSuppressed } from '../../lib/crmPrivacy.js'
import { clampRetentionMonths } from '../../lib/crmRetention.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import {
  DEFAULT_CURRENCY,
  DEFAULT_FORECAST_MONTHS,
  MAX_FORECAST_MONTHS,
  MONTH_PATTERN,
  addMonths,
  buildForecast,
  leadRevenueEntries,
  parisMonth,
  signedByLeadFromEntries,
  summariseRevenue,
  summariseRevenueByCurrency,
  weightedPipeline,
  type RevenueDocument,
} from '../../lib/crmRevenue.js'
import CrmGoal from '../../models/CrmGoal.js'
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
      applyEntityQuery(req, filter, req.query.entity)
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
      const filter: Record<string, unknown> = { ...leadScopeFilter(req), archivedAt: null }
      applyEntityQuery(req, filter, req.query.entity)
      const leads = await Lead.find(filter).sort({ updatedAt: -1 })
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
  body('entity')
    .optional({ values: 'falsy' })
    .isIn([...GROUP_ENTITIES])
    .withMessage('Entité invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const payload: Record<string, any> = normalizeLeadPatch(req.body || {})
      // Périmètre par entité : un utilisateur restreint ne crée que dans ses entités.
      if (!resolveWriteEntity(req, payload)) {
        return res.status(403).json({ error: "Cette entité du groupe est hors de votre périmètre CRM", code: 'LEAD_ENTITY_FORBIDDEN' })
      }

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

      // Doublons probables dans le périmètre de lecture de l'appelant : signalés dans la
      // réponse, ou bloquants (409) si le réglage `duplicateBlockOnCreate` est actif.
      const duplicates = settings.duplicateDetectionEnabled
        ? await checkDuplicateLead(payload as any, settings, null, {
            scope: readsUnrestrictedCrm(req) ? null : leadScopeFilter(req),
          })
        : []
      if (duplicates.length > 0 && settings.duplicateBlockOnCreate) {
        return res.status(409).json({
          error: 'Des leads existants correspondent à ce prospect (doublon probable)',
          code: 'DUPLICATE_LEAD',
          duplicates,
        })
      }

      // Historique, automatisations de statut, auto-qualification, score,
      // conversion WON et événements : tout passe par le service.
      const { lead } = await createLead(payload, {
        actor: req.user!.id,
        source: 'admin',
        settings,
        validateAssignee: false,
      })
      // Forme historique { lead } conservée ; `duplicates` n'est ajouté que s'il y en a.
      return res.status(201).json(duplicates.length > 0 ? { lead, duplicates } : { lead })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, ...err.details })
      return next(err)
    }
  },
)

// Fusion : `sourceId` est absorbé par le lead de l'URL (la cible), puis supprimé.
router.post(
  '/leads/:id/merge',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  idempotentRequest,
  body('sourceId').isMongoId().withMessage('Identifiant du lead à fusionner invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }
      const [target, source] = await Promise.all([Lead.findById(req.params.id), Lead.findById(req.body.sourceId)])
      // Écriture sur les deux leads : hors périmètre, ils n'existent pas pour l'appelant.
      if (!target || isLeadOutOfScope(req, target)) return res.status(404).json({ error: 'Lead not found' })
      if (!source || isLeadOutOfScope(req, source)) return res.status(404).json({ error: 'Lead à fusionner introuvable' })

      const result = await mergeLeads(target, source, req.user!.id)
      return res.json({ lead: result.lead, merged: { sourceId: String(source._id), moved: result.moved, filledFields: result.filledFields } })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, code: err.code, ...err.details })
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
  body('entity')
    .optional({ values: 'falsy' })
    .isIn([...GROUP_ENTITIES])
    .withMessage('Entité invalide'),
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
      // Un lead ne sort pas du périmètre d'entités de qui le modifie.
      if (!resolveWriteEntity(req, payload, lead)) {
        return res.status(403).json({ error: "Cette entité du groupe est hors de votre périmètre CRM", code: 'LEAD_ENTITY_FORBIDDEN' })
      }

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
      const lead = await Lead.findById(req.params.id).select(LEAD_SCOPE_FIELDS)
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

// ─── Données personnelles (RGPD, chantier 3D) ────────────────────────────────

/**
 * Lead visé par une demande de droits (accès, effacement) : réservé à
 * l'administration du CRM (`administersCrm`), qui traite ces demandes pour tout
 * le groupe, dans la limite des entités de l'utilisateur.
 */
async function loadLeadForDataRights(req: Request, res: Response) {
  if (!administersCrm(req)) {
    res.status(403).json({ error: 'Les demandes sur les données personnelles sont réservées aux administrateurs du CRM', code: 'CRM_ADMIN_REQUIRED' })
    return null
  }
  const lead = await Lead.findById(req.params.id)
  const allowed = crmEntityRestriction(req)
  if (!lead || (allowed !== null && !allowed.includes(leadEntityOf(lead)))) {
    res.status(404).json({ error: 'Lead not found' })
    return null
  }
  return lead
}

/** Statut RGPD affiché dans la fiche : consentement, opposition, présence dans la liste de suppression. */
router.get(
  '/leads/:id/privacy',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await Lead.findById(req.params.id).select(`consent doNotContact doNotContactAt doNotContactReason anonymizedAt contactEmail ${LEAD_SCOPE_FIELDS}`)
      if (!lead || !canReadLead(req, lead)) return res.status(404).json({ error: 'Lead not found' })
      return res.json({
        consent: lead.consent,
        doNotContact: Boolean(lead.doNotContact),
        doNotContactAt: lead.doNotContactAt ?? null,
        doNotContactReason: lead.doNotContactReason ?? '',
        anonymizedAt: lead.anonymizedAt ?? null,
        suppressed: await isEmailSuppressed(lead.contactEmail),
        canAdminister: administersCrm(req),
      })
    } catch (err) {
      return next(err)
    }
  },
)

/** Droit d'accès : export JSON complet du lead, de son historique et de ses échanges. */
router.get(
  '/leads/:id/personal-data',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await loadLeadForDataRights(req, res)
      if (!lead) return undefined
      const data = await buildPersonalDataExport(lead._id)
      if (!data) return res.status(404).json({ error: 'Lead not found' })
      await recordAudit({
        action: 'CRM_LEAD_PERSONAL_DATA_EXPORT',
        actor: buildActorFromReq(req),
        entityType: 'Lead',
        entityId: String(lead._id),
        entityRef: lead.company,
        summary: 'Export des données personnelles d’un lead',
        extra: { activities: data.activities.length, interactions: data.interactions.length },
      })
      res.setHeader('Content-Disposition', `attachment; filename="lead-${String(lead._id)}-donnees-personnelles.json"`)
      return res.json(data)
    } catch (err) {
      return next(err)
    }
  },
)

/** Droit à l'effacement : anonymisation (le lead reste pour les statistiques, sans donnée personnelle). */
router.post(
  '/leads/:id/anonymize',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  idempotentRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await loadLeadForDataRights(req, res)
      if (!lead) return undefined
      if (lead.anonymizedAt) return res.status(409).json({ error: 'Lead déjà anonymisé', code: 'ALREADY_ANONYMIZED' })
      await anonymizeLead(lead, { actor: req.user!.id, source: 'admin', reason: 'REQUEST' })
      await recordAudit({
        action: 'CRM_LEAD_ANONYMIZE',
        actor: buildActorFromReq(req),
        entityType: 'Lead',
        entityId: String(lead._id),
        entityRef: lead.company,
        summary: 'Anonymisation d’un lead (demande de la personne)',
      })
      return res.json({ lead })
    } catch (err) {
      if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, ...err.details })
      return next(err)
    }
  },
)

// ─── Chaîne lead → devis → chiffre d'affaires ────────────────────────────────

/** Charge le lead en vérifiant son existence et le périmètre de l'utilisateur. */
async function loadLeadInScope(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id).select(`company clientAccountId budget ${LEAD_SCOPE_FIELDS}`)
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

      // Devis rattachés au lead lui-même (leadId), avec ou sans projet : ceux
      // d'un projet non lisible par l'utilisateur sont écartés.
      const readableProject = ids === null ? {} : { project: { $in: [null, ...ids] } }
      const [documents, projectProposals, leadProposals] = await Promise.all([
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
        QuoteProposal.find({ leadId: lead._id, ...readableProject })
          .select('title status project billingDocument createdAt leadId lines selectedOptionalLineIds')
          .sort({ createdAt: -1 })
          .lean(),
      ])

      const seen = new Set(projectProposals.map((proposal) => String(proposal._id)))
      const proposals = [
        ...projectProposals,
        ...leadProposals
          .filter((proposal) => !seen.has(String(proposal._id)))
          .map(({ lines: _lines, selectedOptionalLineIds: _selected, leadId: _leadId, ...proposal }) => proposal),
      ]
      const entries = leadRevenueEntries({
        documents: documents as unknown as Parameters<typeof leadRevenueEntries>[0]['documents'],
        leadByProject: new Map(projectIds.map((projectId) => [String(projectId), String(lead._id)])),
        proposals: leadProposals as unknown as Parameters<typeof leadRevenueEntries>[0]['proposals'],
      })
      const revenueDocuments = entries.map((entry) => entry.document)

      return res.json({
        lead: { _id: String(lead._id), company: lead.company, budget: lead.budget ?? null },
        projects,
        proposals,
        documents,
        // EUR (devise par défaut) ; les autres devises, jamais additionnées, sont dans byCurrency.
        summary: summariseRevenue(revenueDocuments),
        byCurrency: summariseRevenueByCurrency(revenueDocuments),
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

/**
 * Rattacher ou détacher un projet déplace du chiffre d'affaires d'un lead : c'est
 * une écriture sur le lead. Garde : `manage_crm` + périmètre d'écriture du lead
 * (`isLeadOutOfScope`, via `loadLeadInScope`), et non `administersCrm` seul :
 * le commercial rattache les projets de ses propres leads, le super-admin et
 * l'administrateur ceux de tout lead, l'administrateur restreint par entité
 * seulement dans ses entités. Le projet doit en outre être lisible. Hors
 * périmètre : 404, comme les autres écritures du lead.
 */
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
      // Périmètre de lecture, restreint au besoin à une entité du groupe (?entity=).
      const scope: Record<string, unknown> = leadScopeFilter(req)
      applyEntityQuery(req, scope, req.query.entity)

      // Cohorte : les leads CRÉÉS dans la fenêtre. Un taux de conversion mesuré
      // sur deux populations différentes ne veut rien dire — c'est l'erreur que
      // corrige ce chantier.
      const leadDocs = await Lead.find({ createdAt: { $gte: since }, ...scope })
        .select('status createdAt source budget assignedTo lostReason probability archivedAt')
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
              .select('type status total currency project')
              .lean()

      // Devis rattachés directement aux leads de la cohorte (sans projet, ou
      // projet non rattaché par sourceLead). Ceux d'un projet non lisible sont écartés.
      const cohortProposals = await QuoteProposal.find({
        leadId: { $in: leadDocs.map((lead) => lead._id) },
        status: 'SIGNED',
        ...(ids === null ? {} : { project: { $in: [null, ...ids] } }),
      })
        .select('leadId project billingDocument status lines selectedOptionalLineIds')
        .lean()

      // Montant signé par lead, pour confronter le budget déclaré au réel dans
      // les ventilations par source et par commercial (EUR, sans mélange de devises).
      const entries = leadRevenueEntries({
        documents: cohortDocuments as unknown as Parameters<typeof leadRevenueEntries>[0]['documents'],
        leadByProject: new Map(cohortProjects.map((project) => [String(project._id), String(project.sourceLead)])),
        proposals: cohortProposals as unknown as Parameters<typeof leadRevenueEntries>[0]['proposals'],
      })
      const signedByLead = signedByLeadFromEntries(entries)
      const revenueDocuments = entries.map((entry) => entry.document)
      const byCurrency = summariseRevenueByCurrency(revenueDocuments)

      const declaredBudget = leads.reduce((sum, lead) => sum + (lead.budget ?? 0), 0)

      return res.json({
        period,
        since: since.toISOString(),
        entity: isGroupEntity(req.query.entity) ? req.query.entity : null,
        funnel,
        revenue: {
          currency: DEFAULT_CURRENCY,
          declaredBudget,
          linkedProjects: cohortProjects.length,
          // signed / collected / documents : EUR uniquement. Les autres devises
          // ne sont jamais additionnées : voir byCurrency.
          ...byCurrency[DEFAULT_CURRENCY]!,
          byCurrency,
        },
        // Le pipeline porte sur les affaires EN COURS, quelle que soit leur
        // date de création : ce n'est pas la cohorte, seulement ses taux.
        pipeline: weightedPipeline(
          (
            await Lead.find({ status: { $nin: ['WON', 'LOST'] }, archivedAt: null, ...scope })
              .select('status createdAt budget probability archivedAt')
              .lean()
          ).map((lead) => ({
            _id: String(lead._id),
            status: lead.status,
            createdAt: lead.createdAt,
            budget: lead.budget,
            probability: lead.probability,
            archivedAt: lead.archivedAt,
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
      const filter: Record<string, unknown> = { status: { $nin: ['WON', 'LOST'] }, ...leadScopeFilter(req) }
      applyEntityQuery(req, filter, req.query.entity)
      const leads = await Lead.find(filter).lean()

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

      // Conservation (RGPD) : durée bornée ; l'activation de la purge est un booléen explicite.
      if (updates.retentionMonths !== undefined) {
        const months = Number(updates.retentionMonths)
        if (!Number.isInteger(months) || months !== clampRetentionMonths(months)) {
          return res.status(400).json({ error: 'retentionMonths : nombre entier de mois entre 6 et 120' })
        }
        updates.retentionMonths = months
      }
      if (updates.retentionPurgeEnabled !== undefined && typeof updates.retentionPurgeEnabled !== 'boolean') {
        return res.status(400).json({ error: 'retentionPurgeEnabled : booléen attendu' })
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
      // Seuls les doublons du périmètre de lecture sont renvoyés : la détection ne doit pas
      // révéler les leads d'un collègue. Le périmètre est dans la requête, la limite vient après.
      const duplicates = await checkDuplicateLead(
        { company, contactEmail, contactPhone },
        settings,
        mongoose.isValidObjectId(excludeId) ? excludeId : null,
        { scope: readsUnrestrictedCrm(req) ? null : leadScopeFilter(req) },
      )
      return res.json({ duplicates, enabled: true })
    } catch (err) {
      return next(err)
    }
  },
)

// ── Chantier 3C : prévisions et objectifs ────────────────────────────────────

/**
 * Prévision mensuelle (mois d'Europe/Paris de `expectedCloseAt`) : leads ouverts,
 * brut, pondéré (définition unique : lib/crmRevenue.ts), réalisé (leads WON du
 * mois, par `statusChangedAt`), catégories engagé / probable / pipeline, et
 * objectif du mois avec son avancement. Montants en EUR (devise des budgets).
 * Filtres : `months` (1–24, défaut 6), `from` (YYYY-MM, défaut mois courant),
 * `entity`, `userId` (commercial ; hors équipe élargie, soi-même uniquement).
 */
router.get(
  '/forecast',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawMonths = req.query.months
      const months = rawMonths === undefined ? DEFAULT_FORECAST_MONTHS : Number(rawMonths)
      if (!Number.isInteger(months) || months < 1 || months > MAX_FORECAST_MONTHS) {
        return res.status(400).json({ error: 'months doit être un entier entre 1 et ' + MAX_FORECAST_MONTHS })
      }
      const rawFrom = req.query.from
      if (rawFrom !== undefined && (typeof rawFrom !== 'string' || !MONTH_PATTERN.test(rawFrom))) {
        return res.status(400).json({ error: 'from doit être au format YYYY-MM' })
      }
      const from = typeof rawFrom === 'string' ? rawFrom : parisMonth(new Date())

      const rawUser = req.query.userId
      let userId: string | null = null
      if (rawUser !== undefined && rawUser !== '') {
        if (typeof rawUser !== 'string' || !mongoose.isValidObjectId(rawUser)) {
          return res.status(400).json({ error: 'userId invalide' })
        }
        if (!readsWholeCrm(req) && rawUser !== req.user!.id) {
          return res.status(403).json({ error: 'Les prévisions d’un autre commercial ne sont pas accessibles' })
        }
        userId = rawUser
      }

      const entity = isGroupEntity(req.query.entity) ? req.query.entity : null
      const scope: Record<string, unknown> = leadScopeFilter(req)
      applyEntityQuery(req, scope, req.query.entity)
      if (userId) scope.assignedTo = userId

      // Fenêtre d'interrogation élargie de deux jours de part et d'autre : le
      // classement dans le bon mois de Paris se fait ensuite, instant par instant.
      const windowStart = new Date(from + '-01T00:00:00.000Z')
      windowStart.setUTCDate(windowStart.getUTCDate() - 2)
      const windowEnd = new Date(addMonths(from, months) + '-01T00:00:00.000Z')
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 2)

      const [open, won] = await Promise.all([
        Lead.find({ ...scope, status: { $nin: ['WON', 'LOST'] }, archivedAt: null })
          .select('status budget probability expectedCloseAt archivedAt')
          .lean(),
        Lead.find({ ...scope, status: 'WON', statusChangedAt: { $gte: windowStart, $lt: windowEnd } })
          .select('status budget statusChangedAt')
          .lean(),
      ])

      const restriction = crmEntityRestriction(req)
      const entityVisible = entity === null ? restriction === null : restriction === null || restriction.includes(entity)
      const goals = entityVisible
        ? await CrmGoal.find({ period: { $gte: from, $lt: addMonths(from, months) }, entity, userId }).lean()
        : []

      return res.json({
        ...buildForecast([...open, ...won] as unknown as Parameters<typeof buildForecast>[0], {
          from,
          months,
          goals,
          scope: { entity, userId },
        }),
        entity,
        userId,
        categories: { committed: { min: 70 }, probable: { min: 40, max: 69 }, pipeline: { max: 39 } },
      })
    } catch (err) {
      return next(err)
    }
  },
)

function serializeGoal(goal: {
  _id: unknown
  period: string
  entity?: string | null
  userId?: unknown
  amountTarget: number
  wonCountTarget: number
  createdAt?: Date
  updatedAt?: Date
}) {
  return {
    _id: String(goal._id),
    period: goal.period,
    entity: goal.entity ?? null,
    userId: goal.userId ? String(goal.userId) : null,
    amountTarget: goal.amountTarget,
    wonCountTarget: goal.wonCountTarget,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  }
}

function parseTarget(value: unknown, integer: boolean): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) return null
  if (integer && !Number.isInteger(value)) return null
  return integer ? value : Math.round(value * 100) / 100
}

function requireCrmAdmin(req: Request, res: Response): boolean {
  if (administersCrm(req)) return true
  res.status(403).json({ error: 'Les objectifs sont réservés aux administrateurs du CRM', code: 'CRM_ADMIN_REQUIRED' })
  return false
}

/** Objectifs lisibles : ceux d'une entité hors périmètre et ceux d'un autre commercial restent cachés. */
router.get(
  '/goals',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { period, from, to } = req.query
      for (const value of [period, from, to]) {
        if (value !== undefined && (typeof value !== 'string' || !MONTH_PATTERN.test(value))) {
          return res.status(400).json({ error: 'Les périodes doivent être au format YYYY-MM' })
        }
      }
      const filter: Record<string, unknown> = {}
      if (typeof period === 'string') filter.period = period
      else if (typeof from === 'string' || typeof to === 'string') {
        filter.period = {
          ...(typeof from === 'string' ? { $gte: from } : {}),
          ...(typeof to === 'string' ? { $lte: to } : {}),
        }
      }
      const restriction = crmEntityRestriction(req)
      const and: Record<string, unknown>[] = []
      if (restriction !== null) and.push({ $or: [{ entity: null }, { entity: { $in: restriction } }] })
      if (!readsWholeCrm(req)) and.push({ $or: [{ userId: null }, { userId: req.user!.id }] })
      if (and.length > 0) filter.$and = and

      const goals = await CrmGoal.find(filter).sort({ period: 1, entity: 1 }).lean()
      return res.json({ goals: goals.map(serializeGoal) })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/goals',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireCrmAdmin(req, res)) return
      const { period, entity = null, userId = null } = req.body ?? {}
      if (typeof period !== 'string' || !MONTH_PATTERN.test(period)) {
        return res.status(400).json({ error: 'period doit être au format YYYY-MM' })
      }
      if (entity !== null && !isGroupEntity(entity)) return res.status(400).json({ error: 'Entité inconnue' })
      const amountTarget = parseTarget(req.body?.amountTarget ?? 0, false)
      const wonCountTarget = parseTarget(req.body?.wonCountTarget ?? 0, true)
      if (amountTarget === null || wonCountTarget === null) {
        return res.status(400).json({ error: 'Les objectifs doivent être des nombres positifs (nombre de gains entier)' })
      }
      if (userId !== null && !(await isAssignableCrmUser(userId))) {
        return res.status(400).json({ error: 'Commercial inconnu ou inactif' })
      }
      // Un administrateur restreint à des entités ne fixe pas d'objectif hors d'elles, ni pour tout le groupe.
      const restriction = crmEntityRestriction(req)
      if (restriction !== null && (entity === null || !restriction.includes(entity))) {
        return res.status(403).json({ error: 'Entité hors de votre périmètre', code: 'CRM_ENTITY_FORBIDDEN' })
      }

      try {
        const goal = await CrmGoal.create({ period, entity, userId, amountTarget, wonCountTarget, createdBy: req.user!.id })
        return res.status(201).json({ goal: serializeGoal(goal) })
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          return res.status(409).json({ error: 'Un objectif existe déjà pour ce mois et ce périmètre', code: 'CRM_GOAL_EXISTS' })
        }
        throw err
      }
    } catch (err) {
      return next(err)
    }
  },
)

/** Seules les cibles se modifient ; changer de mois ou de périmètre, c'est supprimer puis recréer. */
router.patch(
  '/goals/:id',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireCrmAdmin(req, res)) return
      const goal = await CrmGoal.findById(req.params.id)
      if (!goal) return res.status(404).json({ error: 'Objectif introuvable' })
      const restriction = crmEntityRestriction(req)
      if (restriction !== null && (goal.entity === null || !restriction.includes(goal.entity))) {
        return res.status(403).json({ error: 'Entité hors de votre périmètre', code: 'CRM_ENTITY_FORBIDDEN' })
      }

      if (req.body?.amountTarget !== undefined) {
        const amountTarget = parseTarget(req.body.amountTarget, false)
        if (amountTarget === null) return res.status(400).json({ error: 'amountTarget invalide' })
        goal.amountTarget = amountTarget
      }
      if (req.body?.wonCountTarget !== undefined) {
        const wonCountTarget = parseTarget(req.body.wonCountTarget, true)
        if (wonCountTarget === null) return res.status(400).json({ error: 'wonCountTarget invalide' })
        goal.wonCountTarget = wonCountTarget
      }
      await goal.save()
      return res.json({ goal: serializeGoal(goal) })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/goals/:id',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!requireCrmAdmin(req, res)) return
      const goal = await CrmGoal.findById(req.params.id)
      if (!goal) return res.status(404).json({ error: 'Objectif introuvable' })
      const restriction = crmEntityRestriction(req)
      if (restriction !== null && (goal.entity === null || !restriction.includes(goal.entity))) {
        return res.status(403).json({ error: 'Entité hors de votre périmètre', code: 'CRM_ENTITY_FORBIDDEN' })
      }
      await goal.deleteOne()
      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
