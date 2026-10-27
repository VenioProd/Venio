import { afterAll, beforeAll, expect, it } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { projectFinanceSummary, recordPayment } from '../lib/projectFinance/payments.js'
import { recordProjectCost } from '../lib/projectFinance/settlements.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import ProjectFinance from '../models/ProjectFinance.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectPayment from '../models/ProjectPayment.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ShareSettlement from '../models/ShareSettlement.js'
import ProjectCost from '../models/ProjectCost.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import Journal from '../models/Journal.js'
import Sequence from '../models/Sequence.js'

const app = express()
app.use(express.json())
app.use('/api/admin/accounting', accountingRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  for (const model of [
    ProjectFinance,
    ProjectPayment,
    ShareAllocation,
    ShareSettlement,
    ProjectCost,
    AccountingEntry,
    AccountingLine,
    FiscalYear,
    ChartOfAccount,
    Journal,
    Sequence,
    BillingDocument,
  ]) {
    await model.init()
  }
})
afterAll(teardownMongo)

it('somme les synthèses des projets et place une échéance future dans son mois de trésorerie', async () => {
  const [admin, client] = await User.create([
    { name: 'Comptabilité', email: 'compta@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  const userId = String(admin._id)
  const cookie = `venio_session=${(await createSession(userId)).token}`
  await ChartOfAccount.create([
    { code: '604000', label: 'Sous-traitance', accountClass: 6, type: 'CHARGE' },
    { code: '401000', label: 'Fournisseurs', accountClass: 4, type: 'PASSIF' },
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '512000', label: 'Banque', accountClass: 5, type: 'ACTIF' },
  ])
  await Journal.create([
    { code: 'BQ', label: 'Banque', type: 'BANQUE' },
    { code: 'AC', label: 'Achats', type: 'ACHAT' },
  ])
  const now = new Date()
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 15))
  const projects = await Project.create([
    { name: 'Projet A', client: client._id },
    { name: 'Projet B', client: client._id },
  ])
  for (const [index, project] of projects.entries()) {
    await ProjectFinance.create({
      project: project._id,
      mode: 'FORFAIT',
      contractHtCents: 10000 * (index + 1),
      vatRateBp: 2000,
      installments: [{ label: 'À venir', percentBp: 10000, trigger: { kind: 'DATE', dueDate: nextMonth } }],
      payers: [{ kind: 'CLIENT', user: client._id, shareBp: 10000, isPrincipal: true, paymentMethod: 'VIREMENT' }],
    })
    const invoice = await BillingDocument.create({
      type: 'INVOICE',
      number: `FAC-${index}`,
      project: project._id,
      client: client._id,
      status: 'ISSUED',
      subtotal: 100 * (index + 1),
      taxTotal: 20 * (index + 1),
      total: 120 * (index + 1),
      dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)),
      createdBy: admin._id,
      lines: [
        { description: 'Prestation', quantity: 1, unitPrice: 100 * (index + 1), taxRate: 20, total: 100 * (index + 1) },
      ],
    })
    await recordPayment({
      invoiceId: String(invoice._id),
      amountTtcCents: 6000,
      receivedAt: now,
      method: 'VIREMENT',
      idempotencyKey: crypto.randomUUID(),
      userId,
    })
    await recordProjectCost({
      projectId: String(project._id),
      accountCode: '604000',
      label: 'Licence',
      supplier: 'Éditeur',
      htCents: 1000,
      vatCents: 0,
      date: now,
      idempotencyKey: crypto.randomUUID(),
      userId,
    })
  }
  const subscriptionProject = await Project.create({ name: 'Abonnement', client: client._id })
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const subscription = await ProjectFinance.create({
    project: subscriptionProject._id,
    mode: 'ABONNEMENT',
    vatRateBp: 2000,
    subscription: { amountHtCents: 15000, period: 'MONTHLY', startDate: periodStart, endDate: nextMonth },
    payers: [{ kind: 'CLIENT', user: client._id, shareBp: 10000, isPrincipal: true, paymentMethod: 'VIREMENT' }],
  })
  await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-ABO',
    project: subscriptionProject._id,
    client: client._id,
    createdBy: admin._id,
    status: 'DRAFT',
    subtotal: 150,
    taxTotal: 30,
    total: 180,
    payer: { payerId: subscription.payers[0]!._id, kind: 'CLIENT', user: client._id },
    financeLink: { kind: 'SUBSCRIPTION', periodStart },
    lines: [{ description: 'Abonnement', quantity: 1, unitPrice: 150, taxRate: 20, total: 150 }],
  })
  subscription.set('payers', [
    {
      kind: 'THIRD_PARTY',
      billingContact: { name: 'Nouveau payeur' },
      shareBp: 10000,
      isPrincipal: true,
      paymentMethod: 'VIREMENT',
    },
  ])
  await subscription.save()
  projects.push(subscriptionProject)
  const summaries = await Promise.all(projects.map((project) => projectFinanceSummary(String(project._id))))
  const response = await request(app).get('/api/admin/accounting/project-finance/dashboard').set('Cookie', cookie)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  for (const key of [
    'invoicedHtCents',
    'invoicedTtcCents',
    'receivedTtcCents',
    'remainingTtcCents',
    'receivedHtCents',
    'directCostsCents',
    'marginCents',
  ] as const) {
    expect(response.body.totals[key]).toBe(summaries.reduce((sum, summary) => sum + summary[key], 0))
  }
  expect(response.body.cashForecast).toHaveLength(12)
  expect(
    response.body.cashForecast.find((row: { month: string }) => row.month === nextMonth.toISOString().slice(0, 7))
      .expectedTtcCents,
  ).toBe(54000)
  expect(response.body.cashForecast[0].expectedTtcCents).toBe(42000)
})
