import { readableProjectIds } from '../../../lib/adminProjectAccess.js'
import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { installmentSchedule } from '../../../lib/projectFinance/invoicing.js'
import { invoicePaymentBalance, projectFinanceSummary } from '../../../lib/projectFinance/payments.js'
import { beneficiaryStatementFor } from '../../../lib/projectFinance/settlements.js'
import { splitPayers, subscriptionPeriodStart } from '../../../lib/projectFinance/rules.js'
import { assertCents, toCents, vatCents } from '../../../lib/projectFinance/money.js'
import ProjectFinance from '../../../models/ProjectFinance.js'
import Project from '../../../models/Project.js'
import User from '../../../models/User.js'
import BillingDocument from '../../../models/BillingDocument.js'
import Beneficiary from '../../../models/Beneficiary.js'
import ProjectCost from '../../../models/ProjectCost.js'
import ProjectPayment from '../../../models/ProjectPayment.js'
import projectFinanceErrors from './projectFinanceErrors.js'

const router = express.Router()
router.use(auth, requireAdmin)

router.get('/dashboard', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1))
    const cashForecast = Array.from({ length: 12 }, (_, index) => ({
      month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1)).toISOString().slice(0, 7),
      expectedTtcCents: 0,
      volume: 0,
    }))
    const addForecast = (date: Date, amount: number) => {
      if (amount <= 0) return
      const month = new Date(Math.max(date.getTime(), monthStart.getTime())).toISOString().slice(0, 7)
      const row = cashForecast.find((row) => row.month === month)
      if (row) {
        row.expectedTtcCents += amount
        assertCents(row.expectedTtcCents)
        row.volume++
      }
    }
    const ids = await readableProjectIds(req.user!)
    const finances = await ProjectFinance.find(ids === null ? {} : { project: { $in: ids } }).lean()
    const projectDocs = await Project.find({ _id: { $in: finances.map((finance) => finance.project) } })
      .select('name client')
      .lean()
    const clients = await User.find({ _id: { $in: projectDocs.map((project) => project.client) } })
      .select('name')
      .lean()
    const projects = []
    const overdueInvoices = []
    const toInvoice = []
    const totals = {
      invoicedHtCents: 0,
      invoicedTtcCents: 0,
      receivedTtcCents: 0,
      remainingTtcCents: 0,
      receivedHtCents: 0,
      directCostsCents: 0,
      marginCents: 0,
    }
    for (const finance of finances) {
      const projectDoc = projectDocs.find((project) => String(project._id) === String(finance.project))
      const project = { _id: finance.project, name: projectDoc?.name ?? 'Projet indisponible' }
      const summary = await projectFinanceSummary(finance.project)
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[key] += summary[key]
        assertCents(totals[key])
      }
      const schedule = await installmentSchedule(finance)
      const documents = await BillingDocument.find({ project: finance.project, type: 'INVOICE' }).sort({ createdAt: 1 })
      const invoices = []
      for (const invoice of documents) {
        const payerName =
          invoice.payer?.billingContact?.name ||
          clients.find((client) => String(client._id) === String(invoice.payer?.user || projectDoc?.client))?.name ||
          'Payeur'
        let balance = null
        if (!invoice.creditedInvoice && invoice.status !== 'CANCELLED') {
          balance = await invoicePaymentBalance(invoice, null)
        }
        const row = {
          _id: invoice._id,
          number: invoice.number,
          status: invoice.status,
          dueAt: invoice.dueAt,
          payerName,
          payer: invoice.payer,
          htCents: toCents(invoice.subtotal),
          totalTtcCents: toCents(invoice.total),
          remainingTtcCents: balance?.remainingTtcCents ?? 0,
          historical: balance?.historical ?? false,
          creditedInvoice: invoice.creditedInvoice,
          financeLink: invoice.financeLink,
        }
        invoices.push(row)
        if (summary.overdueInvoices.some((overdue) => String(overdue.invoice) === String(invoice._id))) {
          overdueInvoices.push({ ...row, project })
        }
        if (balance && balance.remainingTtcCents > 0) {
          let expectedAt = invoice.dueAt || now
          if (invoice.status === 'DRAFT') {
            const installment = schedule.find((item) => String(item._id) === String(invoice.financeLink?.installmentId))
            expectedAt = invoice.dueAt || invoice.financeLink?.periodStart || installment?.trigger.dueDate || now
          }
          addForecast(expectedAt, balance.remainingTtcCents)
        }
        if (invoice.status === 'DRAFT' && invoice.financeLink?.kind === 'SUBSCRIPTION') {
          toInvoice.push({
            kind: 'SUBSCRIPTION_DRAFT',
            project,
            label: invoice.number,
            date: invoice.financeLink.periodStart,
            ttcCents: row.totalTtcCents,
            invoiceId: invoice._id,
          })
        }
      }
      for (const installment of schedule) {
        const ttcCents = installment.payers.reduce((sum, payer) => sum + payer.ttcCents, 0)
        if (installment.status === 'A_FACTURER') {
          toInvoice.push({
            kind: 'INSTALLMENT',
            project,
            label: installment.label,
            date: installment.trigger.dueDate,
            ttcCents,
            installmentId: installment._id,
          })
        }
        if (installment.status !== 'FACTUREE' && installment.trigger.kind === 'DATE' && installment.trigger.dueDate) {
          addForecast(installment.trigger.dueDate, ttcCents)
        }
      }
      if (finance.mode === 'ABONNEMENT' && finance.subscription) {
        const subscription = finance.subscription
        const step = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[subscription.period]
        const monthsSinceStart =
          (monthStart.getUTCFullYear() - subscription.startDate.getUTCFullYear()) * 12 +
          monthStart.getUTCMonth() -
          subscription.startDate.getUTCMonth()
        const parts = splitPayers(
          subscription.amountHtCents,
          finance.payers.map((payer) => ({ key: String(payer._id), bp: payer.shareBp })),
          String(finance.payers.find((payer) => payer.isPrincipal)!._id),
        )
        for (let index = Math.max(0, Math.floor(monthsSinceStart / step)); ; index++) {
          const start = subscriptionPeriodStart(subscription.startDate, subscription.period, index)
          if (start >= end || (subscription.endDate && start > subscription.endDate)) break
          if (start < monthStart) continue
          // Une période active reste portée par ses factures, même si les payeurs ont changé depuis.
          const covered = documents.some(
            (invoice) =>
              invoice.status !== 'CANCELLED' &&
              invoice.financeLink?.kind === 'SUBSCRIPTION' &&
              invoice.financeLink.periodStart?.getTime() === start.getTime(),
          )
          if (covered) continue
          for (const part of parts) {
            addForecast(start, part.cents + vatCents(part.cents, finance.vatRateBp))
          }
        }
      }
      const costs = await ProjectCost.find({ project: finance.project })
        .select('entry supplier htCents vatCents')
        .lean()
      projects.push({ project, mode: finance.mode, ...summary, invoices, costs })
    }
    const beneficiaries = []
    for (const beneficiary of await Beneficiary.find().sort({ displayName: 1 }).lean()) {
      const statement = await beneficiaryStatementFor(beneficiary._id)
      beneficiaries.push({
        _id: beneficiary._id,
        displayName: beneficiary.displayName,
        isActive: beneficiary.isActive,
        dueCents: statement.dueCents,
        paidCents: statement.paidCents,
        remainingCents: statement.remainingCents,
      })
    }
    overdueInvoices.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    res.json({ totals, projects, overdueInvoices, toInvoice, beneficiaries, cashForecast })
  } catch (err) {
    next(err)
  }
})
router.get('/cash-in', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    if (req.query.months !== undefined && req.query.months !== '6' && req.query.months !== '12') {
      return res.status(400).json({ error: 'months doit valoir 6 ou 12' })
    }
    const count = req.query.months === '6' ? 6 : 12
    const now = new Date()
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1, 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const months = Array.from({ length: count }, (_, index) => ({
      month: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1)).toISOString().slice(0, 7),
      receivedTtcCents: 0,
      refundedTtcCents: 0,
      netTtcCents: 0,
    }))
    const ids = await readableProjectIds(req.user!)
    const payments = await ProjectPayment.find({
      ...(ids === null ? {} : { project: { $in: ids } }),
      receivedAt: { $gte: start, $lt: end },
    })
      .select('kind amountTtcCents receivedAt')
      .lean()
    for (const payment of payments) {
      assertCents(payment.amountTtcCents)
      const row = months.find((row) => row.month === payment.receivedAt.toISOString().slice(0, 7))!
      if (payment.kind === 'PAYMENT') row.receivedTtcCents += payment.amountTtcCents
      else row.refundedTtcCents -= payment.amountTtcCents
      row.netTtcCents = row.receivedTtcCents - row.refundedTtcCents
      assertCents(row.receivedTtcCents)
      assertCents(row.refundedTtcCents)
      assertCents(row.netTtcCents)
    }
    return res.json({ months })
  } catch (err) {
    return next(err)
  }
})

router.use(projectFinanceErrors)
export default router
