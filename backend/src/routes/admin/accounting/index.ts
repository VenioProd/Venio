import express from 'express'
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
