import express, { type Request, type Response, type NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import User from '../../models/User.js'
import Lead from '../../models/Lead.js'
import LeadActivity from '../../models/LeadActivity.js'
import ClientContact from '../../models/ClientContact.js'
import { findClientNote, listClientNotes, logInteraction, toClientNoteShape } from '../../lib/interactions.js'
import ClientActivity from '../../models/ClientActivity.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour le CRM : clients, leads, contacts, notes, activities.
 *
 * Périmètre V1 délibérément focalisé sur le CRUD. Les effets composés
 * (auto-conversion lead→client sur status=WON, round-robin assignment,
 * auto-création de projet, etc.) restent dans les routes admin. Un agent
 * qui veut ces effets peut les chaîner via plusieurs appels.
 *
 * Toutes les routes sont protégées par scope :
 *   - GET   → read:crm
 *   - POST  / PATCH / DELETE → write:crm
 *
 * Convention de format :
 *   - Listes paginées : { items, page, pageSize, total }
 *   - Détails / mutations : objet direct sans enveloppe
 *
 * Audit : géré globalement par le middleware agentAudit (post-response).
 * Les handlers posent res.locals.audit avec entityType/entityId/before/after
 * pour enrichir l'entrée AuditLog.
 */

const router = express.Router()

const CRM_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'] as const
const PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
const TEMPERATURES = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'] as const

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && mongoose.isValidObjectId(id)
}

function emitValidationError(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, {
      errors: errors.array(),
    })
    return true
  }
  return false
}

const CLIENT_AGENT_FIELDS = [
  '_id',
  'email',
  'role',
  'name',
  'companyName',
  'serviceType',
  'phone',
  'website',
  'address',
  'tags',
  'source',
  'ownerAdminId',
  'status',
  'onboardingStatus',
  'healthStatus',
  'lastContactAt',
  'archivedAt',
  'isActive',
  'createdAt',
  'updatedAt',
].join(' ')

function sanitizeClientForAgent(client: unknown): Record<string, unknown> {
  const source = client as Record<string, unknown>
  const safe: Record<string, unknown> = {}
  for (const key of CLIENT_AGENT_FIELDS.split(' ')) {
    if (source[key] !== undefined) safe[key] = source[key]
  }
  return safe
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTS  (User.role === 'CLIENT')
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /clients
 * Filtres : ?q=...&status=...&health=...&owner=<userId>|unassigned
 * Tri : ?sort=<champ> ou ?sort=-<champ>
 */
router.get('/clients', requireScope('read:crm'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = { role: 'CLIENT' }

    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: regex }, { companyName: regex }, { email: regex }]
    }
    if (typeof req.query.status === 'string') filter.status = req.query.status
    if (typeof req.query.health === 'string') filter.healthStatus = req.query.health
    if (req.query.owner === 'unassigned') {
      filter.ownerAdminId = null
    } else if (typeof req.query.owner === 'string' && isValidObjectId(req.query.owner)) {
      filter.ownerAdminId = req.query.owner
    }

    const sort = parseSort(req.query.sort, { updatedAt: -1 }, ['createdAt', 'updatedAt', 'name', 'companyName'])

    const [items, total] = await Promise.all([
      User.find(filter)
        .select(CLIENT_AGENT_FIELDS)
        .populate('ownerAdminId', 'name role')
        .sort(sort)
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      User.countDocuments(filter),
    ])

    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/clients/:id',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.findOne({ _id: req.params.id, role: 'CLIENT' })
        .select(CLIENT_AGENT_FIELDS)
        .populate('ownerAdminId', 'name role')
        .lean()
      if (!client) {
        return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      }
      res.json(client)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/clients',
  requireScope('write:crm'),
  body('email').isEmail().withMessage('Email invalide'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Le nom est requis'),
  body('companyName').optional().isString(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const email = String(req.body.email).toLowerCase().trim()
      const existing = await User.findOne({ email })
      if (existing) {
        return respondError(res, 409, 'EMAIL_ALREADY_EXISTS', `Un user avec l'email ${email} existe déjà`)
      }
      // Mot de passe random — le client se le réinitialisera via le flux normal.
      const rawPwd = `agent-pwd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const passwordHash = await bcrypt.hash(rawPwd, 10)
      const client = await User.create({
        email,
        passwordHash,
        role: 'CLIENT',
        name: String(req.body.name).trim(),
        companyName: req.body.companyName ? String(req.body.companyName).trim() : '',
        phone: req.body.phone ? String(req.body.phone).trim() : '',
        status: req.body.status || 'PROSPECT',
      })
      const safe = await User.findById(client._id).select(CLIENT_AGENT_FIELDS).lean()
      res.locals.audit = {
        entityType: 'User',
        entityId: String(client._id),
        entityRef: client.email,
        summary: `Création du client ${client.email}`,
        after: safe,
      }
      res.status(201).json(safe)
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/clients/:id',
  requireScope('write:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.findOne({ _id: req.params.id, role: 'CLIENT' })
      if (!client) {
        return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      }
      const before = sanitizeClientForAgent(client.toObject())

      const allowed = ['name', 'companyName', 'phone', 'status', 'healthStatus', 'serviceType', 'siret', 'tags']
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          ;(client as unknown as Record<string, unknown>)[k] = req.body[k]
        }
      }
      if (req.body.ownerAdminId !== undefined) {
        if (req.body.ownerAdminId === null || isValidObjectId(req.body.ownerAdminId)) {
          ;(client as unknown as { ownerAdminId: unknown }).ownerAdminId = req.body.ownerAdminId
        } else {
          return respondError(res, 400, 'VALIDATION_ERROR', 'ownerAdminId invalide')
        }
      }
      await client.save()
      const safe = await User.findById(client._id).select(CLIENT_AGENT_FIELDS).lean()
      res.locals.audit = {
        entityType: 'User',
        entityId: String(client._id),
        entityRef: client.email,
        summary: `Modification du client ${client.email}`,
        before,
        after: safe,
      }
      res.json(safe)
    } catch (err) {
      next(err)
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/leads', requireScope('read:crm'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ company: regex }, { contactName: regex }, { contactEmail: regex }]
    }
    if (typeof req.query.status === 'string' && (CRM_STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.priority === 'string' && (PRIORITIES as readonly string[]).includes(req.query.priority)) {
      filter.priority = req.query.priority
    }
    if (typeof req.query.assignedTo === 'string' && isValidObjectId(req.query.assignedTo)) {
      filter.assignedTo = req.query.assignedTo
    }

    const sort = parseSort(req.query.sort, { updatedAt: -1 }, [
      'createdAt',
      'updatedAt',
      'company',
      'score',
      'priority',
      'status',
    ])

    const [items, total] = await Promise.all([
      Lead.find(filter)
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(pag.skip)
        .limit(pag.limit)
        .lean(),
      Lead.countDocuments(filter),
    ])

    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/leads/:id',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const lead = await Lead.findById(req.params.id)
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name email')
        .lean()
      if (!lead) return respondError(res, 404, 'NOT_FOUND', 'Lead introuvable')
      res.json(lead)
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/leads',
  requireScope('write:crm'),
  body('company').isString().trim().isLength({ min: 1 }).withMessage('Le nom de société est requis'),
  body('contactEmail').optional({ checkFalsy: true }).isEmail().withMessage('Email invalide'),
  body('status')
    .optional()
    .isIn(CRM_STATUSES as unknown as string[]),
  body('priority')
    .optional()
    .isIn(PRIORITIES as unknown as string[]),
  body('leadTemperature')
    .optional()
    .isIn(TEMPERATURES as unknown as string[]),
  body('budget').optional({ nullable: true }).isNumeric(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      // L'API agent attribue le lead à l'admin créateur du token (createdBy).
      // S'il n'existe pas / token sans owner, on prend un SUPER_ADMIN par défaut.
      const fallbackAdmin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!fallbackAdmin) {
        return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN trouvé pour assigner le lead')
      }
      const payload = normalizeLeadPayload(req.body || {})
      const lead = await Lead.create({
        ...payload,
        createdBy: fallbackAdmin._id,
        assignedTo: payload.assignedTo || null,
      })
      res.locals.audit = {
        entityType: 'Lead',
        entityId: String(lead._id),
        entityRef: lead.company,
        summary: `Création du lead "${lead.company}"`,
        after: lead.toObject(),
      }
      res.status(201).json(lead.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/leads/:id',
  requireScope('write:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const lead = await Lead.findById(req.params.id)
      if (!lead) return respondError(res, 404, 'NOT_FOUND', 'Lead introuvable')
      const before = lead.toObject()
      const payload = normalizeLeadPayload(req.body || {})
      Object.assign(lead, payload)
      if (payload.status && payload.status !== before.status) {
        ;(lead as unknown as { statusChangedAt: Date }).statusChangedAt = new Date()
      }
      await lead.save()
      res.locals.audit = {
        entityType: 'Lead',
        entityId: String(lead._id),
        entityRef: lead.company,
        summary: `Modification du lead "${lead.company}"`,
        before,
        after: lead.toObject(),
      }
      res.json(lead.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/leads/:id',
  requireScope('write:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const lead = await Lead.findById(req.params.id)
      if (!lead) return respondError(res, 404, 'NOT_FOUND', 'Lead introuvable')
      const before = lead.toObject()
      await Lead.deleteOne({ _id: lead._id })
      res.locals.audit = {
        entityType: 'Lead',
        entityId: String(lead._id),
        entityRef: lead.company,
        summary: `Suppression du lead "${lead.company}"`,
        before,
      }
      res.json({ ok: true, deletedId: String(lead._id) })
    } catch (err) {
      next(err)
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS  (rattachés à un client)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/clients/:id/contacts',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.exists({ _id: req.params.id, role: 'CLIENT' })
      if (!client) return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      const items = await ClientContact.find({ clientId: req.params.id }).sort({ isMain: -1, updatedAt: -1 }).lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/clients/:id/contacts',
  requireScope('write:crm'),
  param('id').isMongoId(),
  body('firstName').isString().trim().isLength({ min: 1 }).withMessage('firstName requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.exists({ _id: req.params.id, role: 'CLIENT' })
      if (!client) return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      const { firstName, lastName, email, phone, role: contactRole, isMain, notes } = req.body || {}
      if (isMain === true) {
        await ClientContact.updateMany({ clientId: req.params.id, isMain: true }, { $set: { isMain: false } })
      }
      const contact = await ClientContact.create({
        clientId: req.params.id,
        firstName: String(firstName).trim(),
        lastName: typeof lastName === 'string' ? lastName.trim() : '',
        email: typeof email === 'string' ? email.toLowerCase().trim() : '',
        phone: typeof phone === 'string' ? phone.trim() : '',
        role: typeof contactRole === 'string' ? contactRole.trim() : '',
        isMain: Boolean(isMain),
        notes: typeof notes === 'string' ? notes.trim() : '',
      })
      res.locals.audit = {
        entityType: 'ClientContact',
        entityId: String(contact._id),
        summary: `Ajout du contact ${contact.firstName} ${contact.lastName}`.trim(),
        after: contact.toObject(),
      }
      res.status(201).json(contact.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.patch(
  '/clients/:id/contacts/:contactId',
  requireScope('write:crm'),
  param('id').isMongoId(),
  param('contactId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const contact = await ClientContact.findOne({
        _id: req.params.contactId,
        clientId: req.params.id,
      })
      if (!contact) return respondError(res, 404, 'NOT_FOUND', 'Contact introuvable')
      const before = contact.toObject()

      const fields = ['firstName', 'lastName', 'phone', 'role', 'notes']
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          ;(contact as unknown as Record<string, unknown>)[f] =
            typeof req.body[f] === 'string' ? req.body[f].trim() : ''
        }
      }
      if (req.body.email !== undefined) {
        contact.email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : ''
      }
      if (req.body.isMain === true && !contact.isMain) {
        await ClientContact.updateMany({ clientId: req.params.id, isMain: true }, { $set: { isMain: false } })
        contact.isMain = true
      } else if (req.body.isMain === false) {
        contact.isMain = false
      }
      await contact.save()
      res.locals.audit = {
        entityType: 'ClientContact',
        entityId: String(contact._id),
        before,
        after: contact.toObject(),
      }
      res.json(contact.toObject())
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/clients/:id/contacts/:contactId',
  requireScope('write:crm'),
  param('id').isMongoId(),
  param('contactId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const contact = await ClientContact.findOne({
        _id: req.params.contactId,
        clientId: req.params.id,
      })
      if (!contact) return respondError(res, 404, 'NOT_FOUND', 'Contact introuvable')
      const before = contact.toObject()
      await ClientContact.deleteOne({ _id: contact._id })
      res.locals.audit = {
        entityType: 'ClientContact',
        entityId: String(contact._id),
        summary: `Suppression du contact ${contact.firstName} ${contact.lastName}`.trim(),
        before,
      }
      res.json({ ok: true, deletedId: String(contact._id) })
    } catch (err) {
      next(err)
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// NOTES  (rattachées à un client)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/clients/:id/notes',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.exists({ _id: req.params.id, role: 'CLIENT' })
      if (!client) return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      // Les notes vivent dans Interaction(NOTE, CLIENT) ; la forme renvoyée
      // reste celle de l'ancien modèle ClientNote.
      res.json({ items: await listClientNotes(req.params.id as string) })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/clients/:id/notes',
  requireScope('write:crm'),
  param('id').isMongoId(),
  body('content').isString().trim().isLength({ min: 1 }).withMessage('Contenu requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const client = await User.exists({ _id: req.params.id, role: 'CLIENT' })
      if (!client) return respondError(res, 404, 'NOT_FOUND', 'Client introuvable')
      // L'API agent ne porte pas d'identité utilisateur ; on attribue les notes
      // au premier SUPER_ADMIN trouvé pour respecter le schema (createdBy required).
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) {
        return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN trouvé pour attribuer la note')
      }
      const note = await logInteraction({
        subjectType: 'CLIENT',
        subjectId: req.params.id as string,
        kind: 'NOTE',
        body: String(req.body.content).trim(),
        pinned: Boolean(req.body.pinned),
        author: String(admin._id),
      })
      await note.populate('author', 'name email')
      const shaped = toClientNoteShape(note.toObject())
      res.locals.audit = {
        entityType: 'ClientNote',
        entityId: String(note._id),
        summary: `Ajout d'une note client (${shaped.content.slice(0, 60)}…)`,
        after: shaped,
      }
      res.status(201).json(shaped)
    } catch (err) {
      next(err)
    }
  },
)

router.delete(
  '/clients/:id/notes/:noteId',
  requireScope('write:crm'),
  param('id').isMongoId(),
  param('noteId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const note = await findClientNote(req.params.id as string, req.params.noteId as string)
      if (!note) return respondError(res, 404, 'NOT_FOUND', 'Note introuvable')
      const before = toClientNoteShape(note.toObject())
      await note.deleteOne()
      res.locals.audit = {
        entityType: 'ClientNote',
        entityId: String(note._id),
        before,
      }
      res.json({ ok: true, deletedId: String(note._id) })
    } catch (err) {
      next(err)
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES (lecture seule — créées par le système)
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/clients/:id/activities',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const pag = parsePagination(req)
      const [items, total] = await Promise.all([
        ClientActivity.find({ clientId: req.params.id })
          .sort({ createdAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('actorId', 'name email')
          .lean(),
        ClientActivity.countDocuments({ clientId: req.params.id }),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

router.get(
  '/leads/:id/activities',
  requireScope('read:crm'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const pag = parsePagination(req)
      const [items, total] = await Promise.all([
        LeadActivity.find({ leadId: req.params.id }).sort({ createdAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
        LeadActivity.countDocuments({ leadId: req.params.id }),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  },
)

// ───────────────────────────────────────────────────────────────────────────
// Sort parsing helper (whitelist par ressource)
// ───────────────────────────────────────────────────────────────────────────

function parseSort(raw: unknown, fallback: Record<string, 1 | -1>, whitelist: string[]): Record<string, 1 | -1> {
  if (typeof raw !== 'string' || !raw) return fallback
  const desc = raw.startsWith('-')
  const field = desc ? raw.slice(1) : raw
  if (!whitelist.includes(field)) return fallback
  return { [field]: desc ? -1 : 1 } as Record<string, 1 | -1>
}

function normalizeLeadPayload(body: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (body.company !== undefined) payload.company = String(body.company || '').trim()
  if (body.contactName !== undefined) payload.contactName = String(body.contactName || '')
  if (body.contactEmail !== undefined) payload.contactEmail = String(body.contactEmail || '')
  if (body.contactPhone !== undefined) payload.contactPhone = String(body.contactPhone || '')
  if (body.source !== undefined) payload.source = String(body.source || '')
  if (typeof body.status === 'string' && (CRM_STATUSES as readonly string[]).includes(body.status)) {
    payload.status = body.status
  }
  if (typeof body.priority === 'string' && (PRIORITIES as readonly string[]).includes(body.priority)) {
    payload.priority = body.priority
  }
  if (body.budget !== undefined) {
    const value = Number(body.budget)
    payload.budget = Number.isNaN(value) ? null : value
  }
  if (body.nextActionAt !== undefined) {
    payload.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt as string) : null
  }
  if (body.lastContactAt !== undefined) {
    payload.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt as string) : null
  }
  if (body.notes !== undefined) payload.notes = String(body.notes || '')
  if (body.serviceType !== undefined) payload.serviceType = String(body.serviceType || '')
  if (typeof body.leadTemperature === 'string' && (TEMPERATURES as readonly string[]).includes(body.leadTemperature)) {
    payload.leadTemperature = body.leadTemperature
  }
  if (body.interactionNotes !== undefined) payload.interactionNotes = String(body.interactionNotes || '')
  if (body.assignedTo !== undefined) {
    payload.assignedTo =
      typeof body.assignedTo === 'string' && isValidObjectId(body.assignedTo) ? body.assignedTo : null
  }
  return payload
}

export default router
