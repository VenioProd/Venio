import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import { validateShareRules } from '../../../lib/projectFinance/validation.js'
import ShareTemplate from '../../../models/ShareTemplate.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)
router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (_req, res, next) => {
  try {
    res.json({ templates: await ShareTemplate.find().sort({ name: 1 }).lean() })
  } catch (err) {
    next(err)
  }
})
router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const template = new ShareTemplate({ name: req.body?.name, rules: req.body?.rules })
    await template.validate()
    await validateShareRules(template.rules)
    await template.save()
    await recordAudit({
      action: 'SHARE_TEMPLATE_CREATE',
      actor: buildActorFromReq(req),
      entityType: 'ShareTemplate',
      entityId: String(template._id),
      after: template.toObject(),
    })
    res.status(201).json({ template })
  } catch (err) {
    next(err)
  }
})
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const template = await ShareTemplate.findById(req.params.id)
    if (!template) {
      res.status(404).json({ error: 'Modèle de répartition introuvable' })
      return
    }
    const before = template.toObject()
    if (req.body?.name !== undefined) template.set('name', req.body.name)
    if (req.body?.rules !== undefined) template.set('rules', req.body.rules)
    await template.validate()
    await validateShareRules(template.rules)
    await template.save()
    await recordAudit({
      action: 'SHARE_TEMPLATE_UPDATE',
      actor: buildActorFromReq(req),
      entityType: 'ShareTemplate',
      entityId: String(template._id),
      before,
      after: template.toObject(),
    })
    res.json({ template })
  } catch (err) {
    next(err)
  }
})
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const template = await ShareTemplate.findByIdAndDelete(req.params.id)
    if (!template) {
      res.status(404).json({ error: 'Modèle de répartition introuvable' })
      return
    }
    await recordAudit({
      action: 'SHARE_TEMPLATE_DELETE',
      actor: buildActorFromReq(req),
      entityType: 'ShareTemplate',
      entityId: String(template._id),
      before: template.toObject(),
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
router.use(projectFinanceErrors)
export default router
