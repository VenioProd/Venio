import express, { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Lead from '../../models/Lead.js'
import LeadActivity from '../../models/LeadActivity.js'
import User from '../../models/User.js'
import CrmSettings from '../../models/CrmSettings.js'
import { ADMIN_ROLES, PERMISSIONS } from '../../lib/permissions.js'
import { triggerAutomations } from '../../automation/trigger.js'
import {
  getRoundRobinAssignee,
  logLeadActivity,
  notifyAssignment,
  shouldAutoQualify,
  calculateLeadScore,
  checkDuplicateLead,
  autoCreateProjectFromLead,
  buildWorklist,
} from '../../lib/crmAutomations.js'
import { createClientFolders } from '../../lib/nextcloud.js'
import { createNotification } from '../../lib/notifications.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import logger from '../../lib/logger.js'
import { leadScopeFilter, isLeadOutOfScope } from '../../lib/crmScope.js'
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

const CRM_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
const DEFAULT_FOLLOW_UP_DAYS = 3

function normalizeLeadPayload(body: Record<string, any> = {}): Record<string, any> {
  const payload: Record<string, any> = {}
  if (body.company !== undefined) payload.company = String(body.company || '').trim()
  if (body.contactName !== undefined) payload.contactName = String(body.contactName || '')
  if (body.contactEmail !== undefined) payload.contactEmail = String(body.contactEmail || '')
  if (body.contactPhone !== undefined) payload.contactPhone = String(body.contactPhone || '')
  if (body.source !== undefined) payload.source = String(body.source || '')
  if (body.status !== undefined && CRM_STATUSES.includes(body.status)) payload.status = body.status
  if (body.priority !== undefined && ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'].includes(body.priority)) {
    payload.priority = body.priority
  }
  if (body.budget !== undefined) {
    const value = Number(body.budget)
    payload.budget = Number.isNaN(value) ? null : value
  }
  if (body.nextActionAt !== undefined) payload.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null
  if (body.lastContactAt !== undefined) payload.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt) : null
  if (body.notes !== undefined) payload.notes = String(body.notes || '')
  if (body.serviceType !== undefined) payload.serviceType = String(body.serviceType || '')
  if (body.leadTemperature !== undefined && ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'].includes(body.leadTemperature)) {
    payload.leadTemperature = body.leadTemperature
  }
  if (body.interactionNotes !== undefined) payload.interactionNotes = String(body.interactionNotes || '')
  if (body.lostReason !== undefined) payload.lostReason = String(body.lostReason || '').trim()
  if (body.lostComment !== undefined) payload.lostComment = String(body.lostComment || '')
  if (body.assignedTo !== undefined) payload.assignedTo = body.assignedTo || null
  return payload
}

async function ensureClientForWonLead(
  lead: any,
  actorId: string | null = null,
  enableActivityLog: boolean = true,
): Promise<any> {
  if (!lead || lead.status !== 'WON') return null

  const normalizedEmail = (lead.contactEmail || '').trim().toLowerCase()
  let client: any = null
  let didCreateClient = false
  let didLinkClient = false

  if (lead.clientAccountId) {
    client = await User.findOne({ _id: lead.clientAccountId, role: 'CLIENT' })
  }

  if (!client && normalizedEmail) {
    client = await User.findOne({ email: normalizedEmail, role: 'CLIENT' })
  }

  if (client) {
    const updatePayload: Record<string, any> = {}

    if (!client.companyName && lead.company) updatePayload.companyName = lead.company
    if (!client.serviceType && lead.serviceType) updatePayload.serviceType = lead.serviceType
    if (!client.phone && lead.contactPhone) updatePayload.phone = lead.contactPhone
    if (!client.ownerAdminId && lead.assignedTo) updatePayload.ownerAdminId = lead.assignedTo
    if (!client.name && (lead.contactName || lead.company)) {
      updatePayload.name = lead.contactName || lead.company
    }

    if (Object.keys(updatePayload).length > 0) {
      client = await User.findByIdAndUpdate(client._id, { $set: updatePayload }, { new: true })
    }
  } else {
    const passwordHash = await bcrypt.hash(`crm-autogen-${lead._id}-${Date.now()}`, 10)
    client = await User.create({
      email: normalizedEmail || `client-${lead._id}@placeholder.local`,
      passwordHash,
      name: lead.contactName || lead.company,
      companyName: lead.company,
      serviceType: lead.serviceType || '',
      phone: lead.contactPhone || '',
      role: 'CLIENT',
      source: lead.source ? mapLeadSourceToClientSource(lead.source) : 'AUTRE',
      status: 'ACTIF',
      onboardingStatus: 'A_FAIRE',
      healthStatus: 'BON',
      ownerAdminId: lead.assignedTo || actorId || null,
    })
    didCreateClient = true

    // Create Nextcloud folders for the new client (fire-and-forget)
    createClientFolders(client.companyName || client.name, client._id.toString()).catch((err: Error) => {
      logger.error({ data: err.message || err }, '[Nextcloud] Error creating client folders from CRM:')
    })
  }

  if (!lead.clientAccountId || lead.clientAccountId.toString() !== client._id.toString()) {
    lead.clientAccountId = client._id
    await lead.save()
    didLinkClient = true
  }

  if (enableActivityLog && (didCreateClient || didLinkClient)) {
    await logLeadActivity(
      lead._id,
      'CONVERTED',
      `Lead converti en client: ${client.name}`,
      { clientId: client._id },
      actorId,
    )
  }

  return client
}

// List leads with filters
router.get(
  '/leads',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = leadScopeFilter(req)
      const filter: Record<string, unknown> = { ...scope }
      if (req.query.status && CRM_STATUSES.includes(req.query.status as string)) filter.status = req.query.status
      if (req.query.assignedTo && req.user!.role === 'SUPER_ADMIN') filter.assignedTo = req.query.assignedTo
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
      const leads = await Lead.find(leadScopeFilter(req)).sort({ updatedAt: -1 })
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
  body('company').trim().notEmpty().withMessage("Le nom de l'entreprise est requis"),
  body('contactEmail').optional({ values: 'falsy' }).isEmail().withMessage('Email de contact invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const payload: Record<string, any> = normalizeLeadPayload(req.body || {})

      // Load settings for automation control
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

      // Set initial statusChangedAt
      payload.statusChangedAt = new Date()

      // Automations de base (controlled by settings)
      if (payload.status === 'CONTACTED' && !payload.lastContactAt && settings.autoLastContactOnContacted) {
        payload.lastContactAt = new Date()
      }
      if (payload.status === 'PROPOSAL' && !payload.nextActionAt && settings.autoNextActionOnProposal) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + (settings.proposalFollowUpDays || 3))
        payload.nextActionAt = nextDate
      }
      // DEMO: set nextActionAt for follow-up (if enabled)
      if (payload.status === 'DEMO' && !payload.nextActionAt && settings.autoNextActionOnDemo) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + (settings.demoFollowUpDays || 1))
        payload.nextActionAt = nextDate
      }
      if (['WON', 'LOST'].includes(payload.status) && settings.clearNextActionOnClose) {
        payload.nextActionAt = null
      }

      // Auto-qualification: if budget AND source are set, upgrade to QUALIFIED (if enabled)
      if (
        settings.autoQualifyEnabled &&
        shouldAutoQualify(payload as any) &&
        (!payload.status || payload.status === 'LEAD')
      ) {
        payload.status = 'QUALIFIED'
      }

      // Calculate lead score if scoring is enabled
      if (settings.scoringEnabled) {
        payload.score = calculateLeadScore(payload as any, settings.scoringWeights)
      }

      const lead = await Lead.create(payload)

      // Log creation activity (if enabled)
      if (settings.activityLogging) {
        await logLeadActivity(lead._id, 'CREATED', 'Lead créé', { company: lead.company }, req.user!.id)
      }

      // Send email notification to assigned commercial (if enabled)
      if (lead.assignedTo && settings.emailOnAssignment) {
        const assignee = await User.findById(lead.assignedTo)
        if (assignee) {
          notifyAssignment(lead, assignee).catch(() => {}) // Fire and forget
        }
      }

      // Notif in-app à l'assigné (toujours, même si email désactivé)
      if (lead.assignedTo && String(lead.assignedTo) !== req.user!.id) {
        createNotification({
          recipient: lead.assignedTo,
          type: 'CRM_LEAD_ASSIGNED',
          title: `Nouveau lead assigné`,
          message: `${lead.company}${lead.contactName ? ` — ${lead.contactName}` : ''}`,
          link: `/admin/crm/leads/${lead._id}`,
          metadata: { leadId: String(lead._id) },
        }).catch(() => {})
      }

      // Auto-create client account when lead is WON
      if (lead.status === 'WON') {
        await ensureClientForWonLead(lead, req.user!.id, settings.activityLogging)
        // Auto-create project from won lead (fire-and-forget)
        autoCreateProjectFromLead(lead, req.user!.id).catch(() => {})
      }

      return res.status(201).json({ lead })
    } catch (err) {
      return next(err)
    }
  },
)

// Update lead
router.patch(
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

      // Load settings for automation control
      const settings = await CrmSettings.getSettings()

      const oldStatus = lead.status
      const oldAssignee = lead.assignedTo?.toString() || null

      const payload = normalizeLeadPayload(req.body || {})

      // La liste des motifs est fermée : accepter une valeur hors liste la
      // rendrait ouverte et les statistiques de perte inexploitables.
      if (payload.lostReason && !settings.lostReasons.includes(payload.lostReason)) {
        return res.status(400).json({
          error: 'Motif de perte inconnu',
          allowed: settings.lostReasons,
        })
      }

      Object.assign(lead, payload)

      // Automations de base sur changement de statut
      if (payload.status && payload.status !== oldStatus) {
        // Update statusChangedAt when status changes
        lead.statusChangedAt = new Date()

        // Log status change (if enabled)
        if (settings.activityLogging) {
          await logLeadActivity(
            lead._id,
            'STATUS_CHANGE',
            `Statut: ${oldStatus} → ${payload.status}`,
            { from: oldStatus, to: payload.status },
            req.user!.id,
          )
        }

        if (payload.status === 'CONTACTED' && !lead.lastContactAt && settings.autoLastContactOnContacted) {
          lead.lastContactAt = new Date()
        }
        if (payload.status === 'PROPOSAL' && !lead.nextActionAt && settings.autoNextActionOnProposal) {
          const nextDate = new Date()
          nextDate.setDate(nextDate.getDate() + (settings.proposalFollowUpDays || 3))
          lead.nextActionAt = nextDate
        }
        // DEMO: set nextActionAt for follow-up (if enabled)
        if (payload.status === 'DEMO' && !lead.nextActionAt && settings.autoNextActionOnDemo) {
          const nextDate = new Date()
          nextDate.setDate(nextDate.getDate() + (settings.demoFollowUpDays || 1))
          lead.nextActionAt = nextDate
        }
        if (['WON', 'LOST'].includes(payload.status) && settings.clearNextActionOnClose) {
          lead.nextActionAt = null
        }

        if (payload.status === 'WON') {
          await ensureClientForWonLead(lead, req.user!.id, settings.activityLogging)
          // Auto-create project from won lead (fire-and-forget)
          autoCreateProjectFromLead(lead, req.user!.id).catch(() => {})

          // Trigger automation: auto-convert won lead
          triggerAutomations(['crm.auto_convert_won_lead'], {
            leadId: lead._id.toString(),
            newStatus: 'WON',
            actorId: req.user!.id,
          })

          // Notif super admins : nouveau client signé 🎉
          notifySuperAdmins({
            type: 'CRM_LEAD_CONVERTED',
            title: `🎉 Nouveau client signé`,
            message: `${lead.company} (lead converti en WON)`,
            link: `/admin/crm/leads/${lead._id}`,
            metadata: { leadId: String(lead._id) },
            excludeUserId: req.user!.id,
          }).catch(() => {})
        } else {
          // Notif au créateur et à l'assigné du changement de statut
          const recipients = new Set<string>()
          if (lead.assignedTo) recipients.add(String(lead.assignedTo))
          if (lead.createdBy) recipients.add(String(lead.createdBy))
          recipients.delete(req.user!.id)
          for (const recipientId of recipients) {
            createNotification({
              recipient: recipientId,
              type: 'CRM_LEAD_STATUS_CHANGED',
              title: `Lead ${lead.company} — ${payload.status}`,
              message: `Statut passé de ${oldStatus} à ${payload.status}`,
              link: `/admin/crm/leads/${lead._id}`,
              metadata: { leadId: String(lead._id) },
            }).catch(() => {})
          }
        }
      }

      // Check if assignee changed
      const newAssignee = lead.assignedTo?.toString() || null
      if (payload.assignedTo !== undefined && newAssignee !== oldAssignee) {
        if (settings.activityLogging) {
          await logLeadActivity(
            lead._id,
            'ASSIGNED',
            'Lead réassigné',
            { from: oldAssignee, to: newAssignee },
            req.user!.id,
          )
        }
        // Send email to new assignee (if enabled)
        if (newAssignee && settings.emailOnAssignment) {
          const assignee = await User.findById(newAssignee)
          if (assignee) {
            notifyAssignment(lead, assignee).catch(() => {}) // Fire and forget
          }
        }

        // Notif in-app au nouvel assigné (toujours)
        if (newAssignee && newAssignee !== req.user!.id) {
          createNotification({
            recipient: newAssignee,
            type: 'CRM_LEAD_ASSIGNED',
            title: `Lead réassigné à vous`,
            message: `${lead.company}${lead.contactName ? ` — ${lead.contactName}` : ''}`,
            link: `/admin/crm/leads/${lead._id}`,
            metadata: { leadId: String(lead._id) },
          }).catch(() => {})
        }
      }

      // Auto-qualification: if budget + source are now set and status is still LEAD (if enabled)
      if (settings.autoQualifyEnabled && lead.status === 'LEAD' && shouldAutoQualify(lead)) {
        lead.status = 'QUALIFIED'
        lead.statusChangedAt = new Date()
        if (settings.activityLogging) {
          await logLeadActivity(lead._id, 'AUTO_QUALIFIED', 'Lead auto-qualifié', {}, req.user!.id)
        }
      }

      // Recalculate score if scoring is enabled
      if (settings.scoringEnabled) {
        lead.score = calculateLeadScore(lead, settings.scoringWeights)
      }

      await lead.save()
      return res.json({ lead })
    } catch (err) {
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
      if (isLeadOutOfScope(req, lead)) {
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
      await lead.deleteOne()
      // Also delete related activities
      await LeadActivity.deleteMany({ leadId: req.params.id })
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
      if (!lead || isLeadOutOfScope(req, lead)) {
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
      const seesEveryone = req.user!.role === 'SUPER_ADMIN'

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

      return res.json({
        period,
        since: since.toISOString(),
        funnel: buildFunnel(leads, transitions),
        velocity: computeVelocity(leads, transitions),
        losses: buildLossBreakdown(leads, transitions),
        bySource: groupPerformance(leads, 'source'),
        // Ventiler par personne n'a de sens que pour qui voit tout le monde :
        // sur un périmètre restreint, la table n'aurait qu'une ligne et
        // suggérerait une comparaison qui n'existe pas.
        byOwner: seesEveryone ? groupPerformance(leads, 'assignedTo') : null,
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
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' })
      }
      if (lead.status !== 'WON') {
        return res.status(400).json({ error: 'Only WON leads can be converted to clients' })
      }
      const alreadyLinked = Boolean(lead.clientAccountId)
      const client = await ensureClientForWonLead(lead, req.user!.id, settings.activityLogging)
      return res.status(alreadyLinked ? 200 : 201).json({ client, lead })
    } catch (err) {
      return next(err)
    }
  },
)

// Helper to map lead source to client source enum
function mapLeadSourceToClientSource(leadSource: string): string {
  const sourceMap: Record<string, string> = {
    Ads: 'INBOUND',
    Site: 'INBOUND',
    Referral: 'REFERRAL',
    'Réseaux sociaux': 'INBOUND',
    Email: 'OUTBOUND',
    Autre: 'AUTRE',
  }
  return sourceMap[leadSource] || 'AUTRE'
}

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

// Update CRM settings
router.patch(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates = req.body || {}
      // Remove fields that shouldn't be updated directly
      delete updates._id
      delete updates.createdAt
      delete updates.updatedAt

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
      const duplicates = await checkDuplicateLead({ company, contactEmail, contactPhone }, settings, excludeId)
      return res.json({ duplicates, enabled: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
