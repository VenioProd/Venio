import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose, { type Types } from 'mongoose'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import Lead from '../../models/Lead.js'
import LeadActivity from '../../models/LeadActivity.js'
import User from '../../models/User.js'
import SalesCommission from '../../models/SalesCommission.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { recordAudit, buildActorFromReq } from '../../lib/audit/auditHelpers.js'
import { COMMISSION_RATE_BP, EXTERNAL_SALES_ROLE, commissionTotals } from '../../lib/externalSales.js'

/**
 * Pilotage des commerciaux externes : tableau, journal, réattribution des
 * fiches et versement des commissions. Une seule permission, octroyée au
 * super-admin et, au cas par cas, à qui suit les externes : elle ouvre les
 * leads de tous les externes, au-delà du périmètre CRM habituel.
 */
const router = express.Router()

router.use(auth)
router.use(requireAdmin)
router.use(requirePermission(PERMISSIONS.MANAGE_EXTERNAL_SALES))

// Borne d'une réattribution, y compris « toutes les fiches » d'un commercial.
const MAX_REASSIGN = 1000

function invalid(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]!.msg, errors: errors.array() })
  return true
}

async function findRep(id: string) {
  if (!mongoose.isObjectIdOrHexString(id)) return null
  return User.findOne({ _id: id, role: EXTERNAL_SALES_ROLE }).select('name email isActive createdAt lastLoginAt').lean()
}

router.get('/reps', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const reps = await User.find({ role: EXTERNAL_SALES_ROLE })
      .select('name email isActive createdAt lastLoginAt')
      .sort({ name: 1 })
      .lean()
    const ids = reps.map((rep) => rep._id as Types.ObjectId)
    const [leadStats, totals] = await Promise.all([
      Lead.aggregate<{ _id: Types.ObjectId; total: number; won: number; lost: number; handedOff: number }>([
        { $match: { externalRep: { $in: ids } } },
        {
          $group: {
            _id: '$externalRep',
            total: { $sum: 1 },
            won: { $sum: { $cond: [{ $eq: ['$status', 'WON'] }, 1, 0] } },
            lost: { $sum: { $cond: [{ $eq: ['$status', 'LOST'] }, 1, 0] } },
            handedOff: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$closingHandoff', null] }, null] }, 1, 0] } },
          },
        },
      ]),
      commissionTotals(ids),
    ])
    return res.json({
      rateBp: COMMISSION_RATE_BP,
      reps: reps.map((rep) => {
        const stats = leadStats.find((row) => String(row._id) === String(rep._id))
        const leads = stats?.total ?? 0
        const won = stats?.won ?? 0
        return {
          ...rep,
          leads,
          handedOff: stats?.handedOff ?? 0,
          won,
          lost: stats?.lost ?? 0,
          conversionRate: leads ? won / leads : 0,
          ...totals.get(String(rep._id))!,
        }
      }),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/reps/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rep = await findRep(String(req.params.id))
    if (!rep) return res.status(404).json({ error: 'Commercial introuvable' })
    const [leads, commissions, totals] = await Promise.all([
      Lead.find({ externalRep: rep._id })
        .select('company contactName status closingHandoff assignedTo clientAccountId updatedAt createdAt')
        .populate('assignedTo', 'name')
        .sort({ updatedAt: -1 })
        .lean(),
      SalesCommission.find({ rep: rep._id })
        .sort({ receivedAt: -1, _id: -1 })
        .populate('invoice', 'number')
        .populate('client', 'name companyName')
        .populate('paidBy', 'name')
        .lean(),
      commissionTotals([rep._id as Types.ObjectId]),
    ])
    return res.json({ rep, leads, commissions, totals: totals.get(String(rep._id)) })
  } catch (err) {
    return next(err)
  }
})

/** Journal : ce que le commercial a fait, et ce qui est arrivé à ses fiches. */
router.get('/reps/:id/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rep = await findRep(String(req.params.id))
    if (!rep) return res.status(404).json({ error: 'Commercial introuvable' })
    const leadIds = await Lead.distinct('_id', { externalRep: rep._id })
    const activities = await LeadActivity.find({
      $or: [
        { actorId: rep._id },
        { leadId: { $in: leadIds } },
        // Les fiches qu'on lui a retirées restent dans son historique.
        { type: 'EXTERNAL_REP_CHANGED', 'payload.from': String(rep._id) },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .populate('actorId', 'name')
      .populate('leadId', 'company')
      .lean()
    return res.json({ activities })
  } catch (err) {
    return next(err)
  }
})

/**
 * Réattribue des fiches à un autre externe, ou les rend à l'équipe
 * (`toRep: null`). Soit une liste de leads, soit toutes les fiches d'un
 * commercial (départ). Les commissions déjà constatées restent à celui qui les
 * a gagnées ; les encaissements suivants suivent le nouveau titulaire.
 */
router.post(
  '/reassign',
  idempotentRequest,
  body('leadIds').optional().isArray({ min: 1, max: 1000 }).withMessage('Liste de leads invalide'),
  body('leadIds.*').optional().isMongoId().withMessage('Lead invalide'),
  body('fromRep').optional().isMongoId().withMessage('Commercial invalide'),
  body('toRep')
    .custom((value) => value === null || mongoose.isObjectIdOrHexString(value))
    .withMessage('Destinataire invalide'),
  body().custom((value) => Boolean(value?.leadIds) !== Boolean(value?.fromRep)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const toRep = req.body.toRep ? await findRep(String(req.body.toRep)) : null
      if (req.body.toRep && (!toRep || !toRep.isActive)) {
        return res.status(400).json({ error: 'Le destinataire doit être un commercial externe actif' })
      }
      const target = (toRep?._id as Types.ObjectId | undefined) ?? null
      const filter: Record<string, unknown> = req.body.fromRep
        ? { externalRep: new mongoose.Types.ObjectId(String(req.body.fromRep)) }
        : { _id: { $in: req.body.leadIds.map((id: string) => new mongoose.Types.ObjectId(id)) } }
      const leads = await Lead.find({
        ...filter,
        externalRep: target === null ? { $ne: null } : { $nin: [null, target] },
      })
        .select('externalRep')
        .limit(MAX_REASSIGN + 1)
        .lean()
      if (leads.length > MAX_REASSIGN) {
        return res.status(400).json({ error: `Plus de ${MAX_REASSIGN} fiches : réattribuez-les par lots` })
      }
      // Une seule écriture, atomique fiche par fiche : l'assignation suit si elle
      // désignait l'ancien titulaire ; celle d'un closer reste.
      const ids = leads.map((lead) => lead._id)
      await Lead.collection.updateMany({ _id: { $in: ids } }, [
        {
          $set: {
            assignedTo: { $cond: [{ $eq: ['$assignedTo', '$externalRep'] }, target, '$assignedTo'] },
            externalRep: target,
            updatedAt: '$$NOW',
          },
        },
      ])
      await LeadActivity.insertMany(
        leads.map((lead) => ({
          leadId: lead._id,
          type: 'EXTERNAL_REP_CHANGED',
          label: toRep ? `Fiche réattribuée à ${toRep.name}` : "Fiche rendue à l'équipe",
          payload: { from: String(lead.externalRep), to: target ? String(target) : null },
          actorId: req.user!.id,
        })),
      )
      const moved = leads.length
      await recordAudit({
        actor: buildActorFromReq(req),
        action: 'EXTERNAL_SALES_REASSIGN',
        entityType: 'Lead',
        summary: `${moved} fiche(s) réattribuée(s)`,
        extra: {
          toRep: target ? String(target) : null,
          fromRep: req.body.fromRep ?? null,
          movedLeadIds: ids.map(String),
        },
      })
      return res.json({ moved })
    } catch (err) {
      return next(err)
    }
  },
)

/** Marque des commissions comme versées : une liste, ou tout le dû d'un commercial. */
router.post(
  '/commissions/mark-paid',
  idempotentRequest,
  body('ids').optional().isArray({ min: 1, max: 1000 }).withMessage('Liste invalide'),
  body('ids.*').optional().isMongoId().withMessage('Commission invalide'),
  body('rep').optional().isMongoId().withMessage('Commercial invalide'),
  body().custom((value) => Boolean(value?.ids) !== Boolean(value?.rep)),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (invalid(req, res)) return
      const filter: Record<string, unknown> = { status: 'DUE' }
      if (req.body.rep) filter.rep = new mongoose.Types.ObjectId(String(req.body.rep))
      else filter._id = { $in: req.body.ids.map((id: string) => new mongoose.Types.ObjectId(id)) }
      const due = await SalesCommission.find(filter).select('_id amountCents').lean()
      const result = await SalesCommission.updateMany(
        { _id: { $in: due.map((line) => line._id) }, status: 'DUE' },
        { $set: { status: 'PAID', paidAt: new Date(), paidBy: req.user!.id } },
      )
      await recordAudit({
        actor: buildActorFromReq(req),
        action: 'EXTERNAL_SALES_COMMISSIONS_PAID',
        entityType: 'SalesCommission',
        summary: `${result.modifiedCount} commission(s) marquée(s) versée(s)`,
        extra: { rep: req.body.rep ?? null, ids: due.map((line) => String(line._id)) },
      })
      return res.json({ paid: result.modifiedCount })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
