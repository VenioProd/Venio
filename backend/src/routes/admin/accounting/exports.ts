import express, { type Response } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import {
  exportFilters,
  paymentsCsv,
  settlementsCostsCsv,
  statementForExport,
  renderStatementPdf,
  projectSheetPdf,
} from '../../../lib/projectFinance/exports.js'
import Beneficiary from '../../../models/Beneficiary.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)
const canView = requirePermission(PERMISSIONS.VIEW_ACCOUNTING)

function attachment(res: Response, filename: string, content: string | Buffer) {
  res.setHeader('Content-Type', filename.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'private, no-store')
  res.send(content)
}

router.get('/payments.csv', canView, async (req, res, next) => {
  try {
    attachment(res, 'encaissements-parts.csv', await paymentsCsv(exportFilters(req.query)))
  } catch (error) {
    next(error)
  }
})

router.get('/settlements-costs.csv', canView, async (req, res, next) => {
  try {
    attachment(res, 'versements-couts.csv', await settlementsCostsCsv(exportFilters(req.query)))
  } catch (error) {
    next(error)
  }
})

router.get<{ id: string }>('/beneficiaries/:id/statement.pdf', canView, async (req, res, next) => {
  try {
    const filters = exportFilters(req.query)
    const statement = await statementForExport(req.params.id, filters)
    attachment(res, `releve-${statement.beneficiary._id}.pdf`, await renderStatementPdf(statement, filters))
  } catch (error) {
    next(error)
  }
})

router.get('/me/statement.pdf', async (req, res, next) => {
  try {
    const filters = exportFilters(req.query)
    const beneficiary = await Beneficiary.findOne({ user: req.user!.id }).select('_id')
    if (!beneficiary) {
      res.status(404).json({ error: 'Aucun bénéficiaire lié à cet utilisateur' })
      return
    }
    const statement = await statementForExport(beneficiary._id, filters)
    attachment(res, 'mon-releve.pdf', await renderStatementPdf(statement, filters))
  } catch (error) {
    next(error)
  }
})

router.get<{ projectId: string }>('/projects/:projectId/sheet.pdf', canView, async (req, res, next) => {
  try {
    exportFilters({ projectId: req.params.projectId })
    const filters = exportFilters(req.query)
    attachment(res, `fiche-projet-${req.params.projectId}.pdf`, await projectSheetPdf(req.params.projectId, filters))
  } catch (error) {
    next(error)
  }
})

router.use(projectFinanceErrors)
export default router
