import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import CrmSequence from '../models/CrmSequence.js'
import CrmSequenceEnrollment, { ENROLLMENT_STATUSES, OPEN_ENROLLMENT_STATUSES } from '../models/CrmSequenceEnrollment.js'
import {
  ENROLL_MAX,
  activationProblem,
  emptyStats,
  enrollLeads,
  isSequenceStatus,
  normalizeSequencePayload,
  sequenceStats,
  unenrollLeads,
} from '../lib/crmSequences.js'
import type { CrmExtrasAdapters } from './crmExtras.js'

/**
 * Séquences d'e-mails du CRM (lot 5), montées par `createCrmExtrasRouter` :
 * `/api/admin/crm/sequences…` et `/api/v1/agent/crm/sequences…`.
 *
 * - Lecture (séquences, inscriptions, statistiques) : garde `read`.
 * - Inscription / désinscription : garde `write` (manage_crm, write:crm) et
 *   périmètre d'écriture des leads.
 * - Créer, modifier, activer, mettre en pause, supprimer une séquence :
 *   `canAdministerSequences` (administersCrm côté admin, `admin:*` côté agent).
 */
const isId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)
const ADMIN_MESSAGE = 'La gestion des séquences est réservée aux administrateurs du CRM'

export function createCrmSequencesRouter(a: CrmExtrasAdapters): express.Router {
  const router = express.Router()
  const administers = (req: Request) => (a.canAdministerSequences ? a.canAdministerSequences(req) : false)
  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req, res).catch(next)
    }

  /** Leads lisibles par l'appelant, ou `undefined` s'il lit tout le CRM. */
  const readableLeads = async (req: Request) => {
    const scope = a.leadScope(req)
    if (Object.keys(scope).length === 0) return undefined
    return (await Lead.distinct('_id', scope)) as mongoose.Types.ObjectId[]
  }

  const loadSequence = async (req: Request, res: Response) => {
    if (!isId(req.params.id)) {
      a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
      return null
    }
    const sequence = await CrmSequence.findById(req.params.id)
    if (!sequence) a.fail(res, 404, 'NOT_FOUND', 'Séquence introuvable')
    return sequence
  }

  router.get('/sequences', ...a.read, wrap(async (req, res) => {
    const items = await CrmSequence.find().sort({ status: 1, updatedAt: -1 }).lean()
    const stats = await sequenceStats(items.map((s) => s._id), await readableLeads(req))
    res.json({ items: items.map((s) => ({ ...s, stats: stats.get(String(s._id)) ?? emptyStats() })), canAdminister: administers(req) })
  }))

  router.get('/sequences/:id', ...a.read, wrap(async (req, res) => {
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    const stats = await sequenceStats([sequence._id], await readableLeads(req))
    res.json({ ...sequence.toObject(), stats: stats.get(String(sequence._id)) ?? emptyStats(), canAdminister: administers(req) })
  }))

  router.post('/sequences', ...a.write, ...a.idem, wrap(async (req, res) => {
    if (!administers(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', ADMIN_MESSAGE)
    const { data, errors } = normalizeSequencePayload(req.body || {}, { creating: true })
    if (errors.length) return a.fail(res, 400, 'VALIDATION_ERROR', errors.join(' ; '))
    const me = await a.actor(req)
    // Une séquence naît toujours en brouillon : l'activation est un acte distinct.
    const sequence = await CrmSequence.create({ ...data, status: 'DRAFT', createdBy: me.id, updatedBy: me.id })
    res.status(201).json({ ...sequence.toObject(), stats: emptyStats() })
  }))

  router.patch('/sequences/:id', ...a.write, ...a.idem, wrap(async (req, res) => {
    if (!administers(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', ADMIN_MESSAGE)
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    const { data, errors } = normalizeSequencePayload(req.body || {})
    const nextStatus = req.body?.status
    if (nextStatus !== undefined && !isSequenceStatus(nextStatus)) errors.push('status : DRAFT, ACTIVE ou PAUSED')
    if (errors.length) return a.fail(res, 400, 'VALIDATION_ERROR', errors.join(' ; '))
    Object.assign(sequence, data)
    if (nextStatus !== undefined) {
      if (nextStatus === 'ACTIVE') {
        const problem = activationProblem(sequence)
        if (problem) return a.fail(res, 409, 'EMPTY_SEQUENCE', problem)
        if (sequence.status !== 'ACTIVE') sequence.activatedAt = new Date()
      }
      sequence.status = nextStatus
    }
    if (sequence.status === 'ACTIVE' && activationProblem(sequence)) return a.fail(res, 409, 'EMPTY_SEQUENCE', activationProblem(sequence)!)
    const me = await a.actor(req)
    sequence.updatedBy = me.id ? new mongoose.Types.ObjectId(me.id) : null
    await sequence.save()
    const stats = await sequenceStats([sequence._id], await readableLeads(req))
    res.json({ ...sequence.toObject(), stats: stats.get(String(sequence._id)) ?? emptyStats() })
  }))

  router.delete('/sequences/:id', ...a.write, ...a.idem, wrap(async (req, res) => {
    if (!administers(req)) return a.fail(res, 403, 'CRM_ADMIN_REQUIRED', ADMIN_MESSAGE)
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    if (await CrmSequenceEnrollment.exists({ sequence: sequence._id, status: { $in: OPEN_ENROLLMENT_STATUSES } })) {
      return a.fail(res, 409, 'HAS_OPEN_ENROLLMENTS', 'Des leads sont encore inscrits : désinscrivez-les ou mettez la séquence en pause')
    }
    await CrmSequenceEnrollment.deleteMany({ sequence: sequence._id })
    await sequence.deleteOne()
    res.json({ ok: true, deletedId: String(sequence._id) })
  }))

  const leadIdsOf = (req: Request, res: Response): string[] | null => {
    const ids = req.body?.leadIds
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isId)) {
      a.fail(res, 400, 'VALIDATION_ERROR', 'leadIds : liste d’identifiants requise')
      return null
    }
    if (ids.length > ENROLL_MAX) {
      a.fail(res, 400, 'TOO_MANY', `${ENROLL_MAX} leads au maximum par appel`)
      return null
    }
    return ids
  }

  router.post('/sequences/:id/enroll', ...a.write, ...a.idem, wrap(async (req, res) => {
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    const ids = leadIdsOf(req, res)
    if (!ids) return
    if (sequence.steps.length === 0) return a.fail(res, 409, 'EMPTY_SEQUENCE', 'La séquence n’a aucune étape')
    const me = await a.actor(req)
    const result = await enrollLeads(sequence, ids, { actorId: me.id, scope: a.writeScope(req) })
    res.locals.audit = {
      entityType: 'CrmSequence',
      entityId: String(sequence._id),
      entityRef: `${result.enrolled.length}/${ids.length}`,
      summary: `Inscription de ${result.enrolled.length} lead(s) à la séquence « ${sequence.name} »`,
    }
    res.json({ sequenceId: String(sequence._id), sequenceStatus: sequence.status, ...result })
  }))

  router.post('/sequences/:id/unenroll', ...a.write, ...a.idem, wrap(async (req, res) => {
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    const ids = leadIdsOf(req, res)
    if (!ids) return
    const me = await a.actor(req)
    const result = await unenrollLeads(sequence, ids, { actorId: me.id, scope: a.writeScope(req) })
    res.json({ sequenceId: String(sequence._id), ...result })
  }))

  router.get('/sequences/:id/enrollments', ...a.read, wrap(async (req, res) => {
    const sequence = await loadSequence(req, res)
    if (!sequence) return
    const filter: Record<string, unknown> = { sequence: sequence._id }
    if (typeof req.query.status === 'string' && (ENROLLMENT_STATUSES as readonly string[]).includes(req.query.status)) filter.status = req.query.status
    const readable = await readableLeads(req)
    if (readable) filter.lead = { $in: readable }
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50))
    const [items, total] = await Promise.all([
      CrmSequenceEnrollment.find(filter)
        .select('-openKey')
        .populate('lead', 'company contactName status')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      CrmSequenceEnrollment.countDocuments(filter),
    ])
    res.json({ items, page, pageSize, total })
  }))

  router.get('/leads/:id/sequences', ...a.read, wrap(async (req, res) => {
    if (!isId(req.params.id)) return a.fail(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide')
    const lead = await Lead.findOne({ _id: req.params.id, ...a.leadScope(req) }).select('_id')
    if (!lead) return a.fail(res, 404, 'NOT_FOUND', 'Lead introuvable')
    const items = await CrmSequenceEnrollment.find({ lead: lead._id })
      .select('-openKey')
      .populate('sequence', 'name status steps')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json({ items })
  }))

  return router
}
