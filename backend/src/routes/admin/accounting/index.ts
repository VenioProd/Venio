import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import { canReadProject } from '../../../lib/adminProjectAccess.js'
import BillingDocument from '../../../models/BillingDocument.js'
import exportsRouter from './exports.js'
import stripeRouter from './stripe.js'
import beneficiariesRouter from './beneficiaries.js'
import shareTemplatesRouter from './shareTemplates.js'
import creditNotesRouter from './creditNotes.js'
import paymentsRouter from './payments.js'
import settlementsRouter from './settlements.js'
import projectFinanceRouter from './projectFinance.js'
import projectFinanceDashboardRouter from './projectFinanceDashboard.js'
import settingsRouter from './settings.js'
import fiscalYearsRouter from './fiscalYears.js'
import chartOfAccountsRouter from './chartOfAccounts.js'
import journalsRouter from './journals.js'
import vatRatesRouter from './vatRates.js'
import entriesRouter from './entries.js'
import reportsRouter from './reports.js'
import vatRouter from './vat.js'
import fecRouter from './fec.js'
import lettrageRouter from './lettrage.js'
import externalSourcesRouter from './externalSources.js'
import externalTransactionsRouter from './externalTransactions.js'

// Router racine pour /api/admin/accounting.
// /audit-log reste à porter en Phase G avec le système d'audit étendu.
const router = express.Router()
router.use(auth, requireAdmin)
router.use(async (req, res, next) => {
  try {
    if (req.method !== 'GET' || req.user!.role !== 'COMMERCIAL') return next()
    const segments = req.path.split('/').slice(1).map(decodeURIComponent)
    if (segments[0]?.toLowerCase() === 'exports') segments.shift()
    const kind = segments[0]?.toLowerCase()
    const projectId =
      kind === 'projects'
        ? segments[1]
        : kind === 'invoices'
          ? (await BillingDocument.findById(segments[1]).select('project').lean())?.project?.toString()
          : req.query.projectId
    if (typeof projectId === 'string' && !(await canReadProject(req.user!, projectId))) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }
    next()
  } catch (err) {
    next(err)
  }
})
router.use(stripeRouter)

router.use('/exports', exportsRouter)
router.use('/project-finance', projectFinanceDashboardRouter)
router.use(creditNotesRouter)
router.use(paymentsRouter)
router.use(settlementsRouter)
router.use('/beneficiaries', beneficiariesRouter)
router.use('/share-templates', shareTemplatesRouter)
router.use('/projects/:projectId', projectFinanceRouter)
router.use('/settings', settingsRouter)
router.use('/fiscal-years', fiscalYearsRouter)
router.use('/chart-of-accounts', chartOfAccountsRouter)
router.use('/journals', journalsRouter)
router.use('/vat-rates', vatRatesRouter)
router.use('/entries', entriesRouter)
router.use('/reports', reportsRouter)
router.use('/vat', vatRouter)
router.use('/fec', fecRouter)
router.use('/lettrage', lettrageRouter)
router.use('/external-sources', externalSourcesRouter)
router.use('/external-transactions', externalTransactionsRouter)

export default router
