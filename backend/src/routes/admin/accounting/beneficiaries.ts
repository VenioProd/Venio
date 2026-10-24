import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import Beneficiary from '../../../models/Beneficiary.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)
const fields = [
  'kind',
  'user',
  'displayName',
  'email',
  'siret',
  'vatRegistered',
  'defaultAccountCode',
  'settlementMode',
  'isActive',
] as const

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const filter: { isActive?: boolean } = {}
    if (req.query.active !== undefined) {
      if (req.query.active !== 'true' && req.query.active !== 'false') {
        res.status(400).json({ error: 'Le filtre active doit valoir true ou false' })
        return
      }
      filter.isActive = req.query.active === 'true'
    }
    res.json({ beneficiaries: await Beneficiary.find(filter).sort({ displayName: 1 }).lean() })
  } catch (err) {
    next(err)
  }
})
router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const beneficiary = new Beneficiary()
    for (const field of fields) {
      if (req.body?.[field] !== undefined) beneficiary.set(field, req.body[field])
    }
    await beneficiary.save()
    await recordAudit({
      action: 'BENEFICIARY_CREATE',
      actor: buildActorFromReq(req),
      entityType: 'Beneficiary',
      entityId: String(beneficiary._id),
      after: beneficiary.toObject(),
    })
    res.status(201).json({ beneficiary })
  } catch (err) {
    next(err)
  }
})
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const beneficiary = await Beneficiary.findById(req.params.id)
    if (!beneficiary) {
      res.status(404).json({ error: 'Bénéficiaire introuvable' })
      return
    }
    const before = beneficiary.toObject()
    for (const field of fields) {
      if (req.body?.[field] !== undefined) beneficiary.set(field, req.body[field])
    }
    await beneficiary.save()
    await recordAudit({
      action: 'BENEFICIARY_UPDATE',
      actor: buildActorFromReq(req),
      entityType: 'Beneficiary',
      entityId: String(beneficiary._id),
      before,
      after: beneficiary.toObject(),
    })
    res.json({ beneficiary })
  } catch (err) {
    next(err)
  }
})
router.post('/:id/archive', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const beneficiary = await Beneficiary.findById(req.params.id)
    if (!beneficiary) {
      res.status(404).json({ error: 'Bénéficiaire introuvable' })
      return
    }
    const before = beneficiary.toObject()
    beneficiary.isActive = false
    await beneficiary.save()
    await recordAudit({
      action: 'BENEFICIARY_ARCHIVE',
      actor: buildActorFromReq(req),
      entityType: 'Beneficiary',
      entityId: String(beneficiary._id),
      before,
      after: beneficiary.toObject(),
    })
    res.json({ beneficiary })
  } catch (err) {
    next(err)
  }
})
router.use(projectFinanceErrors)
export default router
