import express, { type RequestHandler } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../../lib/audit/auditHelpers.js'
import { assertVersionEffectiveDate, ruleVersionAt } from '../../../lib/projectFinance/rules.js'
import {
  lastAllocatedPaymentAt,
  validateProjectFinance,
  validateShareRules,
} from '../../../lib/projectFinance/validation.js'
import Project from '../../../models/Project.js'
import ProjectFinance from '../../../models/ProjectFinance.js'
import ShareRuleVersion from '../../../models/ShareRuleVersion.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router({ mergeParams: true })
router.use(auth, requireAdmin)
type ProjectParams = { projectId: string }
const requireProject: RequestHandler<ProjectParams> = async (req, res, next) => {
  try {
    if (!(await Project.exists({ _id: req.params.projectId }))) {
      res.status(404).json({ error: 'Projet introuvable' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
router.get<ProjectParams>(
  '/finance',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  requireProject,
  async (req, res, next) => {
    try {
      const finance = await ProjectFinance.findOne({ project: req.params.projectId }).lean()
      const now = new Date()
      const versions = await ShareRuleVersion.find({
        project: req.params.projectId,
        effectiveFrom: { $lte: now },
      }).lean()
      let ruleVersion = null
      if (versions.length) {
        const selected = ruleVersionAt(
          versions.map((version) => ({
            ...version,
            rules: version.rules.map((rule) => ({ key: String(rule.beneficiary), bp: rule.bp })),
          })),
          now,
        )
        ruleVersion = versions.find((version) => version.version === selected.version)!
      }
      res.json({ finance, ruleVersion })
    } catch (err) {
      next(err)
    }
  },
)
router.put<ProjectParams>(
  '/finance',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  requireProject,
  async (req, res, next) => {
    try {
      const body = req.body || {}
      const replacement = new ProjectFinance({
        project: req.params.projectId,
        mode: body.mode,
        contractHtCents: body.contractHtCents,
        vatRateBp: body.vatRateBp,
        installments: body.installments,
        subscription: body.subscription,
        payers: body.payers,
        shareActivationDate: body.shareActivationDate,
      })
      await replacement.validate()
      await validateProjectFinance(replacement)
      let finance = await ProjectFinance.findOne({ project: req.params.projectId })
      const before = finance?.toObject() ?? null
      if (finance) {
        finance.overwrite({ ...replacement.toObject(), _id: finance._id, createdAt: finance.createdAt })
      } else {
        finance = replacement
      }
      await finance.save()
      await recordAudit({
        action: 'PROJECT_FINANCE_SAVE',
        actor: buildActorFromReq(req),
        entityType: 'ProjectFinance',
        entityId: String(finance._id),
        before,
        after: finance.toObject(),
      })
      res.json({ finance })
    } catch (err) {
      next(err)
    }
  },
)
router.get<ProjectParams>(
  '/share-rules',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  requireProject,
  async (req, res, next) => {
    try {
      res.json({
        versions: await ShareRuleVersion.find({ project: req.params.projectId }).sort({ version: -1 }).lean(),
      })
    } catch (err) {
      next(err)
    }
  },
)
router.post<ProjectParams>(
  '/share-rules',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  requireProject,
  async (req, res, next) => {
    try {
      const lastVersion = await ShareRuleVersion.findOne({ project: req.params.projectId }).sort({ version: -1 }).lean()
      const version = new ShareRuleVersion({
        project: req.params.projectId,
        version: (lastVersion?.version ?? 0) + 1,
        effectiveFrom: req.body?.effectiveFrom,
        rules: req.body?.rules,
        reason: req.body?.reason,
        createdBy: req.user!.id,
      })
      await version.validate()
      await validateShareRules(version.rules)
      assertVersionEffectiveDate(version.effectiveFrom, await lastAllocatedPaymentAt(req.params.projectId))
      await version.save()
      await recordAudit({
        action: 'SHARE_RULE_VERSION_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'ShareRuleVersion',
        entityId: String(version._id),
        after: version.toObject(),
      })
      res.status(201).json({ version })
    } catch (err) {
      next(err)
    }
  },
)
router.use(projectFinanceErrors)
export default router
