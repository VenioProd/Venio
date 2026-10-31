import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose, { type Types } from 'mongoose'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import requireRole from '../../middleware/role.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import Lead from '../../models/Lead.js'
import LeadActivity from '../../models/LeadActivity.js'
import Interaction from '../../models/Interaction.js'
import User from '../../models/User.js'
import SalesCommission from '../../models/SalesCommission.js'
import CrmSettings from '../../models/CrmSettings.js'
import { logLeadActivity, checkDuplicateLead } from '../../lib/crmAutomations.js'
import { logInteraction } from '../../lib/interactions.js'
import { notifyUsers } from '../../lib/notifyHelpers.js'
import { ADMIN_ROLES } from '../../lib/permissions.js'
import {
  COMMISSION_RATE_BP,
  EXTERNAL_SALES_ROLE,
  commissionTotals,
  isRepLead,
  repClients,
  repLeadFilter,
} from '../../lib/externalSales.js'
import type { ILead } from '../../types/models/index.js'

/**
 * Espace du commercial externe. Chaque lecture part de `repLeadFilter` ou de
 * `isRepLead` ; un lead hors périmètre répond 404, comme un lead inexistant.
 */
const router = express.Router()

router.use(auth)
router.use(requireRole(EXTERNAL_SALES_ROLE))

// Le closing (devis, signature) revient à l'équipe : l'externe s'arrête avant.
const REP_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'LOST']
const STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
// Le journal montré à l'externe se limite à ce qui concerne son travail ; les
// événements internes (projets, devis, escalade) restent côté équipe.
const VISIBLE_ACTIVITY_TYPES = ['CREATED', 'STATUS_CHANGE', 'READY_TO_CLOSE', 'CONVERTED']
const INTERACTION_KINDS = ['EMAIL', 'CALL', 'MEETING', 'NOTE']

function toRepLead(lead: ILead) {
  return {
    _id: lead._id,
    company: lead.company,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    source: lead.source,
    status: lead.status,
    priority: lead.priority,
    budget: lead.budget,
    nextActionAt: lead.nextActionAt,
    lastContactAt: lead.lastContactAt,
    // Après le passage, l'équipe reprend les notes : l'externe ne voit plus que les siennes.
    notes: lead.closingHandoff ? (lead.closingHandoff.repNotes ?? '') : lead.notes,
    serviceType: lead.serviceType,
    leadTemperature: lead.leadTemperature,
    lostReason: lead.lostReason,
    lostComment: lead.lostComment,
    handedOffAt: lead.closingHandoff?.at ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  }
}

function invalid(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]!.msg, errors: errors.array() })
  return true
}

async function findRepLead(req: Request, res: Response) {
  const id = String(req.params.id)
  const lead = mongoose.isObjectIdOrHexString(id)
    ? await Lead.findOne({ _id: id, ...repLeadFilter(req.user!.id) })
    : null
  if (!lead || !isRepLead(req.user!.id, lead)) {
    res.status(404).json({ error: 'Lead not found' })
    return null
  }
  return lead
}

function rejectHandedOff(lead: ILead, res: Response): boolean {
  if (!lead.closingHandoff) return false
  res.status(409).json({ error: 'Dossier transmis pour closing : il est en lecture seule', code: 'LEAD_HANDED_OFF' })
  return true
}

/** Champs qu'un externe peut saisir ; le reste (assignation, score, compte client) reste à l'équipe. */
function repLeadPayload(input: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {}
  for (const field of ['company', 'contactName', 'contactEmail', 'contactPhone', 'source', 'notes', 'serviceType']) {
    if (input[field] !== undefined) payload[field] = String(input[field] ?? '').trim()
  }
  for (const field of ['lostReason', 'lostComment']) {
    if (input[field] !== undefined) payload[field] = String(input[field] ?? '').trim()
  }
  if (input.status !== undefined) payload.status = input.status
  if (input.priority !== undefined) payload.priority = input.priority
  if (input.leadTemperature !== undefined) payload.leadTemperature = input.leadTemperature
  if (input.budget !== undefined)
    payload.budget = input.budget === null || input.budget === '' ? null : Number(input.budget)
  for (const field of ['nextActionAt', 'lastContactAt']) {
    if (input[field] !== undefined) payload[field] = input[field] ? new Date(String(input[field])) : null
  }
  return payload
}

const leadValidators = [
  body('company').optional().isString().trim().notEmpty().withMessage("Le nom de l'entreprise est requis"),
  body('contactEmail').optional({ values: 'falsy' }).isEmail().withMessage('Email de contact invalide'),
  body('status').optional().isIn(REP_STATUSES).withMessage('Statut non autorisé'),
  body('priority').optional().isIn(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']).withMessage('Priorité invalide'),
  body('leadTemperature')
    .optional()
    .isIn(['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'])
    .withMessage('Température invalide'),
  body('budget').optional({ values: 'null' }).isFloat({ min: 0 }).withMessage('Budget invalide'),
  body(['nextActionAt', 'lastContactAt']).optional({ values: 'falsy' }).isISO8601().withMessage('Date invalide'),
]

function searchFilter(req: Request): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...repLeadFilter(req.user!.id) }
  if (typeof req.query.status === 'string' && STATUSES.includes(req.query.status)) filter.status = req.query.status
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const q = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = ['company', 'contactName', 'contactEmail'].map((field) => ({ [field]: { $regex: q, $options: 'i' } }))
  }
  return filter
}

router.get('/leads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leads = await Lead.find(searchFilter(req)).sort({ updatedAt: -1 }).limit(500)
    return res.json({ leads: leads.map(toRepLead) })
  } catch (err) {
    return next(err)
  }
})

// Neutralise les formules qu'un tableur exécuterait à l'ouverture.
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

router.get('/leads/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leads = await Lead.find(searchFilter(req)).sort({ updatedAt: -1 })
    const date = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '')
    const rows = [
      [
        'Entreprise',
        'Contact',
        'Email',
        'Téléphone',
        'Statut',
        'Priorité',
        'Budget',
        'Prochaine action',
        'Transmis le',
        'Créé le',
      ],
      ...leads.map((lead) => [
        lead.company,
        lead.contactName,
        lead.contactEmail,
        lead.contactPhone,
        lead.status,
        lead.priority,
        lead.budget ?? '',
        date(lead.nextActionAt),
        date(lead.closingHandoff?.at),
        date(lead.createdAt),
      ]),
    ]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="mes-leads.csv"')
    return res.send(`\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`)
  } catch (err) {
    return next(err)
  }
})

router.post(
  '/leads',
  idempotentRequest,
  body('company').isString().trim().notEmpty().withMessage("Le nom de l'entreprise est requis"),
  ...leadValidators,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const repId = req.user!.id
      const now = new Date()
      const lead = new Lead({
        ...repLeadPayload(req.body),
        externalRep: repId,
        assignedTo: repId,
        createdBy: repId,
        statusChangedAt: now,
      })
      lead.$locals.assignmentActorId = repId
      await lead.save()
      await logLeadActivity(lead._id, 'CREATED', 'Lead créé', { company: lead.company }, repId)

      // Un doublon n'est pas refusé : le refuser révélerait qu'un autre suit ce
      // prospect. L'équipe arbitre ; le détail reste hors de la vue de l'externe.
      const settings = await CrmSettings.getSettings()
      if (settings.duplicateDetectionEnabled) {
        const duplicates = await checkDuplicateLead(lead, settings, lead._id)
        if (duplicates.length > 0) {
          await logLeadActivity(
            lead._id,
            'POSSIBLE_DUPLICATE',
            'Doublon possible avec un lead existant',
            { duplicateIds: duplicates.map((duplicate: { _id: unknown }) => String(duplicate._id)) },
            repId,
          )
        }
      }
      return res.status(201).json({ lead: toRepLead(lead) })
    } catch (err) {
      return next(err)
    }
  },
)

router.get('/leads/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = await findRepLead(req, res)
    if (!lead) return
    const [activities, interactions] = await Promise.all([
      LeadActivity.find({ leadId: lead._id, type: { $in: VISIBLE_ACTIVITY_TYPES } })
        .sort({ createdAt: -1 })
        .populate<{ actorId: { name: string } | null }>('actorId', 'name')
        .lean(),
      // Ses propres échanges seulement : ceux de l'équipe peuvent porter le devis.
      Interaction.find({ subjectType: 'LEAD', subjectId: lead._id, author: req.user!.id })
        .sort({ occurredAt: -1 })
        .select('kind direction occurredAt subject body createdAt')
        .lean(),
    ])
    return res.json({
      lead: toRepLead(lead),
      activities: activities.map((activity) => ({
        _id: activity._id,
        type: activity.type,
        label: activity.label,
        actorName: activity.actorId?.name ?? null,
        createdAt: activity.createdAt,
      })),
      interactions,
    })
  } catch (err) {
    return next(err)
  }
})

router.patch(
  '/leads/:id',
  idempotentRequest,
  ...leadValidators,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const lead = await findRepLead(req, res)
      if (!lead || rejectHandedOff(lead, res)) return
      if (!REP_STATUSES.includes(lead.status)) {
        return res.status(409).json({ error: 'Ce lead est entre les mains de l’équipe', code: 'LEAD_CLOSED' })
      }
      const payload = repLeadPayload(req.body)
      const previousStatus = lead.status
      lead.set(payload)
      if (payload.status && payload.status !== previousStatus) lead.statusChangedAt = new Date()
      await lead.save()
      if (payload.status && payload.status !== previousStatus) {
        await logLeadActivity(
          lead._id,
          'STATUS_CHANGE',
          `Statut : ${previousStatus} → ${lead.status}`,
          { from: previousStatus, to: lead.status },
          req.user!.id,
        )
      }
      return res.json({ lead: toRepLead(lead) })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/leads/:id/interactions',
  idempotentRequest,
  body('kind').isIn(INTERACTION_KINDS).withMessage("Type d'échange invalide"),
  body('direction').optional().isIn(['OUT', 'IN', 'NONE']).withMessage('Sens invalide'),
  body('occurredAt').optional({ values: 'falsy' }).isISO8601().withMessage('Date invalide'),
  body('subject').optional().isString().isLength({ max: 500 }),
  body('body').optional().isString().isLength({ max: 20000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const lead = await findRepLead(req, res)
      if (!lead || rejectHandedOff(lead, res)) return
      const interaction = await logInteraction({
        subjectType: 'LEAD',
        subjectId: lead._id as Types.ObjectId,
        kind: req.body.kind,
        direction: req.body.direction,
        occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : undefined,
        subject: req.body.subject,
        body: req.body.body,
        author: req.user!.id,
      })
      if (req.body.kind !== 'NOTE') {
        lead.lastContactAt = interaction.occurredAt
        await lead.save()
      }
      return res.status(201).json({
        interaction: {
          _id: interaction._id,
          kind: interaction.kind,
          direction: interaction.direction,
          occurredAt: interaction.occurredAt,
          subject: interaction.subject,
          body: interaction.body,
          createdAt: interaction.createdAt,
        },
      })
    } catch (err) {
      return next(err)
    }
  },
)

/** Le closer désigné dans les réglages CRM, ou à défaut les super-admins. */
async function resolveCloser() {
  const settings = await CrmSettings.getSettings()
  if (settings.defaultCloserId) {
    const closer = await User.findOne({ _id: settings.defaultCloserId, role: { $in: ADMIN_ROLES }, isActive: true })
      .select('_id')
      .lean()
    if (closer) return { closer: closer._id as Types.ObjectId, recipients: [closer._id as Types.ObjectId] }
  }
  const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  return { closer: null, recipients: superAdmins.map((admin) => admin._id as Types.ObjectId) }
}

router.post(
  '/leads/:id/ready-to-close',
  idempotentRequest,
  body('message').optional().isString().isLength({ max: 5000 }).withMessage('Message trop long'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const lead = await findRepLead(req, res)
      if (!lead || rejectHandedOff(lead, res)) return
      if (!REP_STATUSES.includes(lead.status) || lead.status === 'LOST') {
        return res.status(409).json({ error: 'Seul un lead en cours peut être transmis', code: 'LEAD_NOT_OPEN' })
      }
      const repId = req.user!.id
      const { closer, recipients } = await resolveCloser()
      // Conditionnel sur closingHandoff : deux clics simultanés ne transmettent qu'une fois.
      const handedOff = await Lead.findOneAndUpdate(
        { _id: lead._id, ...repLeadFilter(repId), closingHandoff: null },
        {
          $set: { closingHandoff: { at: new Date(), to: closer, by: repId, repNotes: lead.notes }, assignedTo: closer },
        },
        { new: true },
      )
      if (!handedOff) {
        return res.status(409).json({ error: 'Dossier déjà transmis', code: 'LEAD_HANDED_OFF' })
      }
      const message = typeof req.body.message === 'string' ? req.body.message.trim() : ''
      await logLeadActivity(
        lead._id,
        'READY_TO_CLOSE',
        'Dossier transmis pour closing',
        { closerId: closer ? String(closer) : null, fallbackToSuperAdmins: !closer },
        repId,
      )
      if (message) {
        await logInteraction({
          subjectType: 'LEAD',
          subjectId: lead._id as Types.ObjectId,
          kind: 'NOTE',
          subject: 'Passage de main',
          body: message,
          author: repId,
        })
      }
      await notifyUsers(recipients, {
        type: 'CRM_LEAD_READY_TO_CLOSE',
        title: 'Lead prêt à closer',
        message: `${lead.company} — transmis par ${req.user!.name}`,
        link: `/admin/crm/leads/${lead._id}`,
        metadata: { leadId: String(lead._id), externalRepId: repId },
      }).catch(() => {})
      return res.json({ lead: toRepLead(handedOff) })
    } catch (err) {
      return next(err)
    }
  },
)

router.get('/clients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owned = await repClients(req.user!.id)
    const ids = [...owned.keys()].map((id) => new mongoose.Types.ObjectId(id))
    const [clients, leads, totals] = await Promise.all([
      User.find({ _id: { $in: ids }, role: 'CLIENT' })
        .select('name companyName email phone createdAt')
        .lean(),
      Lead.find({ _id: { $in: [...owned.values()] } })
        .select('company')
        .lean(),
      SalesCommission.aggregate<{ _id: Types.ObjectId; collectedHtCents: number; commissionCents: number }>([
        { $match: { rep: new mongoose.Types.ObjectId(req.user!.id), client: { $in: ids } } },
        {
          $group: {
            _id: '$client',
            collectedHtCents: { $sum: '$baseHtCents' },
            commissionCents: { $sum: '$amountCents' },
          },
        },
      ]),
    ])
    return res.json({
      clients: clients.map((client) => {
        const leadId = owned.get(String(client._id))
        const total = totals.find((row) => String(row._id) === String(client._id))
        return {
          _id: client._id,
          name: client.name,
          companyName: client.companyName,
          email: client.email,
          phone: client.phone,
          signedAt: client.createdAt,
          lead: { _id: leadId, company: leads.find((lead) => String(lead._id) === String(leadId))?.company ?? '' },
          collectedHtCents: total?.collectedHtCents ?? 0,
          commissionCents: total?.commissionCents ?? 0,
        }
      }),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/commissions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repId = req.user!.id
    const [lines, totals] = await Promise.all([
      SalesCommission.find({ rep: repId })
        .sort({ receivedAt: -1, _id: -1 })
        .limit(1000)
        .populate<{ invoice: { number: string } | null }>('invoice', 'number')
        .populate<{ client: { name: string; companyName?: string } | null }>('client', 'name companyName')
        .lean(),
      commissionTotals([repId]),
    ])
    return res.json({
      rateBp: COMMISSION_RATE_BP,
      totals: totals.get(repId),
      commissions: lines.map((line) => ({
        _id: line._id,
        kind: line.kind,
        invoiceNumber: line.invoice?.number ?? '',
        clientName: line.client?.companyName || line.client?.name || '',
        baseHtCents: line.baseHtCents,
        rateBp: line.rateBp,
        amountCents: line.amountCents,
        receivedAt: line.receivedAt,
        status: line.status,
        paidAt: line.paidAt,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

export default router
