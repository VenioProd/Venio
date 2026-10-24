import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import Stripe from 'stripe'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { createSession } from '../lib/session.js'
import { recordPayment, recordRefund } from '../lib/projectFinance/payments.js'
import webhook from '../routes/stripe.js'
import publicPay from '../routes/public/pay.js'
import accounting from '../routes/admin/accounting/index.js'
import StripeEvent from '../models/StripeEvent.js'
import InvoicePaymentLink from '../models/InvoicePaymentLink.js'
import ProjectPayment from '../models/ProjectPayment.js'
import ShareAllocation from '../models/ShareAllocation.js'
import ProjectFinance from '../models/ProjectFinance.js'
import ShareRuleVersion from '../models/ShareRuleVersion.js'
import BillingDocument from '../models/BillingDocument.js'
import Beneficiary from '../models/Beneficiary.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import FiscalYear from '../models/FiscalYear.js'
import Sequence from '../models/Sequence.js'

const sdk = vi.hoisted(() => ({
  paymentIntents: { retrieve: vi.fn() },
  charges: { retrieve: vi.fn() },
  refunds: { list: vi.fn(), retrieve: vi.fn() },
  payouts: { retrieve: vi.fn() },
  events: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
}))
vi.mock('../lib/stripe/client.js', async (original) => {
  const actual = await original<typeof import('../lib/stripe/client.js')>()
  const { default: StripeSdk } = await import('stripe')
  return { ...actual, getStripeClient: () => ({ ...sdk, webhooks: StripeSdk.webhooks }) }
})

const app = express()
app.use('/api/stripe', webhook)
app.use(express.json())
app.use('/api/public/pay', publicPay)
app.use('/accounting', accounting)
app.get('/health', (_req, res) => res.json({ ok: true }))
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
const secret = 'whsec_test_local_only'
let invoiceId: string
let userId: string
let cookie: string
let token: string
let linkId: string
let pi: Record<string, unknown>
const created = Math.floor(new Date('2026-01-10').getTime() / 1000)
function event(type = 'checkout.session.completed', id = `evt_${crypto.randomUUID()}`, object?: object) {
  return {
    id,
    type,
    created,
    object: 'event',
    data: {
      object: object ?? {
        id: 'cs_paid',
        payment_status: 'paid',
        payment_intent: 'pi_test',
        amount_total: 1,
        metadata: { invoiceId, linkId },
      },
    },
  }
}
function deliver(body = event(), signature?: string | null) {
  const payload = JSON.stringify(body)
  const call = request(app).post('/api/stripe/webhook').set('Content-Type', 'application/json')
  if (signature !== null)
    call.set('Stripe-Signature', signature ?? Stripe.webhooks.generateTestHeaderString({ payload, secret }))
  return call.send(payload)
}
async function createLink() {
  const response = await request(app)
    .post(`/accounting/invoices/${invoiceId}/payment-link`)
    .set('Cookie', cookie)
    .expect(201)
  token = new URL(response.body.url).pathname.split('/').pop()!
  linkId = String((await InvoicePaymentLink.findOne({ invoice: invoiceId }))!._id)
}
beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [
      StripeEvent,
      InvoicePaymentLink,
      ProjectPayment,
      ShareAllocation,
      ProjectFinance,
      ShareRuleVersion,
      BillingDocument,
      Sequence,
      AccountingEntry,
      AccountingLine,
      FiscalYear,
      Journal,
      ChartOfAccount,
    ].map((model) => model.init()),
  )
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await teardownMongo()
})
beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_local_only')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret)
  vi.stubEnv('PUBLIC_APP_URL', 'https://venio.example.test')
  vi.stubEnv('CREDENTIALS_KEY', 'test-encryption-only')
  await clearDb()
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  userId = String(admin._id)
  cookie = `venio_session=${(await createSession(userId)).token}`
  const project = await Project.create({ name: 'Projet', client: client!._id })
  const finance = await ProjectFinance.create({
    project: project._id,
    mode: 'FORFAIT',
    contractHtCents: 99990,
    vatRateBp: 2000,
    shareActivationDate: '2026-01-01',
    installments: [{ label: 'Solde', percentBp: 10000, trigger: { kind: 'DATE', dueDate: '2026-01-01' } }],
    payers: [{ kind: 'CLIENT', user: client!._id, shareBp: 10000, isPrincipal: true, paymentMethod: 'STRIPE' }],
  })
  await ChartOfAccount.create([
    { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF' },
    { code: '512000', label: 'Banque', accountClass: 5, type: 'ACTIF' },
    { code: '512800', label: 'Stripe', accountClass: 5, type: 'ACTIF' },
    { code: '627800', label: 'Frais', accountClass: 6, type: 'CHARGE' },
    { code: '604000', label: 'Prestations', accountClass: 6, type: 'CHARGE' },
  ])
  await Journal.create({ code: 'BQ', label: 'Banque', type: 'BANQUE' })
  const beneficiary = await Beneficiary.create({
    kind: 'FREELANCE',
    displayName: 'Freelance',
    defaultAccountCode: '604000',
    settlementMode: 'BANQUE',
  })
  await ShareRuleVersion.create({
    project: project._id,
    version: 1,
    effectiveFrom: '2026-01-01',
    createdBy: userId,
    rules: [{ beneficiary: beneficiary._id, bp: 3500 }],
  })
  const invoice = await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-STRIPE',
    project: project._id,
    client: client!._id,
    createdBy: userId,
    status: 'SENT',
    sentAt: '2026-01-01',
    payer: { payerId: finance.payers[0]!._id, kind: 'CLIENT', user: client!._id, billingContact: { name: 'Payeur' } },
    subtotal: 999.9,
    taxTotal: 199.98,
    total: 1199.88,
    lines: [{ description: 'Prestation', quantity: 1, unitPrice: 999.9, taxRate: 20, total: 999.9 }],
  })
  invoiceId = String(invoice._id)
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_previous', status: 'open' })
  sdk.checkout.sessions.expire.mockResolvedValue({ status: 'expired' })
  sdk.checkout.sessions.create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.com/test' })
  await createLink()
  pi = {
    id: 'pi_test',
    status: 'succeeded',
    currency: 'eur',
    amount_received: 119988,
    created,
    metadata: { invoiceId, linkId },
    latest_charge: {
      id: 'ch_test',
      payment_intent: 'pi_test',
      currency: 'eur',
      amount: 119988,
      balance_transaction: { id: 'txn_test', currency: 'eur', amount: 119988, fee: 1825, net: 118163, created },
    },
  }
  sdk.paymentIntents.retrieve.mockImplementation(async () => pi)
  sdk.charges.retrieve.mockResolvedValue({ id: 'ch_test', payment_intent: 'pi_test', currency: 'eur' })
})

it('refuse les signatures absentes, invalides et anciennes sans aucune trace financière', async () => {
  await deliver(event(), null).expect(400)
  await deliver(event(), 't=1,v1=incorrect').expect(400)
  const body = event()
  await deliver(
    body,
    Stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(body), secret, timestamp: 1 }),
  ).expect(400)
  expect(await StripeEvent.countDocuments()).toBe(0)
  expect(await ProjectPayment.countDocuments()).toBe(0)
})

it('relit le brut et la commission, comptabilise le net et répartit le HT du brut', async () => {
  await deliver().expect(200)
  const payment = (await ProjectPayment.findOne())!
  expect(payment).toMatchObject({
    amountTtcCents: 119988,
    htCents: 99990,
    source: 'STRIPE',
    method: 'STRIPE',
    stripePaymentIntentId: 'pi_test',
    stripeChargeId: 'ch_test',
  })
  expect(sdk.paymentIntents.retrieve).toHaveBeenCalledWith('pi_test', { expand: ['latest_charge.balance_transaction'] })
  const lines = await AccountingLine.find({ entry: payment.entry }).sort({ sortIndex: 1 })
  expect(lines.map((line) => [line.accountCode, line.debit, line.credit])).toEqual([
    ['512800', 1181.63, 0],
    ['627800', 18.25, 0],
    ['411000', 0, 1199.88],
  ])
  expect(lines[2]!.auxiliaryRef!.kind).toBe('CLIENT')
  expect(lines[2]!.lettrage).toBeTruthy()
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('PAID')
  const parts = await ShareAllocation.find().sort({ amountCents: 1 })
  expect(parts.map((row) => row.amountCents)).toEqual([34996, 64994])
})

it('déduplique en concurrence le même événement et deux événements du même PaymentIntent', async () => {
  const body = event()
  await Promise.all([
    deliver(body).expect(200),
    deliver(body).expect(200),
    deliver(event('checkout.session.async_payment_succeeded')).expect(200),
  ])
  await deliver(body).expect(200)
  expect(await ProjectPayment.countDocuments()).toBe(1)
  expect(await AccountingEntry.countDocuments()).toBe(1)
  expect(await StripeEvent.countDocuments({ status: 'PROCESSED' })).toBe(2)
})

it('met le dépassement en revue et le retraitement relit Stripe après résolution', async () => {
  const manual = await recordPayment({
    invoiceId,
    amountTtcCents: 40000,
    method: 'VIREMENT',
    receivedAt: new Date('2026-01-09'),
    idempotencyKey: 'prior-payment',
    userId,
  })
  const body = event()
  await deliver(body).expect(200)
  const row = (await StripeEvent.findOne())!
  expect(row.status).toBe('NEEDS_REVIEW')
  expect(await ProjectPayment.countDocuments({ source: 'STRIPE' })).toBe(0)
  await recordRefund({
    paymentId: String(manual.payment._id),
    amountTtcCents: 40000,
    receivedAt: new Date('2026-01-09'),
    reason: 'Correction du doublon bancaire',
    idempotencyKey: 'resolve-payment',
    userId,
  })
  sdk.events.retrieve.mockResolvedValue(body)
  await request(app).post(`/accounting/stripe/events/${row._id}/retry`).set('Cookie', cookie).expect(200)
  expect(sdk.events.retrieve).toHaveBeenCalledWith(body.id)
  expect((await StripeEvent.findById(row._id))!).toMatchObject({ status: 'PROCESSED', attempts: 2 })
  expect(await ProjectPayment.countDocuments({ source: 'STRIPE' })).toBe(1)
})

it('répond 500 sur indisponibilité de Stripe sans trace puis accepte le rejeu', async () => {
  sdk.paymentIntents.retrieve.mockRejectedValueOnce(new Error('network'))
  const body = event()
  await deliver(body).expect(500)
  expect(await StripeEvent.countDocuments()).toBe(0)
  expect(await ProjectPayment.countDocuments()).toBe(0)
  await deliver(body).expect(200)
  expect(await ProjectPayment.countDocuments()).toBe(1)
})

it('importe tous les remboursements réussis une fois et annule les parts au total', async () => {
  await deliver().expect(200)
  const refunds: object[] = []
  sdk.refunds.list.mockImplementation(() => ({
    async *[Symbol.asyncIterator]() {
      yield* refunds
    },
  }))
  for (const [index, amount] of [15000, 25000, 79988].entries()) {
    refunds.push({
      id: `re_${index}`,
      status: 'succeeded',
      amount,
      currency: 'eur',
      charge: 'ch_test',
      payment_intent: 'pi_test',
      created: created + index + 1,
    })
    await deliver(event('charge.refunded', undefined, { id: 'ch_test', amount_refunded: 1 })).expect(200)
    await deliver(event('charge.refunded', undefined, { id: 'ch_test' })).expect(200)
  }
  expect(await ProjectPayment.countDocuments({ kind: 'REFUND', source: 'STRIPE' })).toBe(3)
  const lines = await AccountingLine.find({ credit: { $gt: 0 }, accountCode: '512800' }).sort({ credit: 1 })
  expect(lines.map((row) => row.credit)).toEqual([150, 250, 799.88])
  expect(await AccountingLine.countDocuments({ accountCode: '411000', debit: { $gt: 0 } })).toBe(3)
  const parts = await ShareAllocation.find()
  for (const beneficiary of [null, parts.find((row) => row.beneficiary)!.beneficiary]) {
    expect(
      parts
        .filter((row) => String(row.beneficiary) === String(beneficiary))
        .reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(0)
  }
})

it('refuse la saisie manuelle d’un remboursement Stripe pour éviter son double import', async () => {
  await deliver().expect(200)
  const payment = (await ProjectPayment.findOne())!
  await request(app)
    .post(`/accounting/payments/${payment._id}/refunds`)
    .set('Cookie', cookie)
    .send({ amountTtcCents: 10000, receivedAt: '2026-01-11', reason: 'Manuel', idempotencyKey: 'manual-refund' })
    .expect(409)
  expect(await ProjectPayment.countDocuments({ kind: 'REFUND' })).toBe(0)
})

it('rapproche un virement relu une seule fois même sous plusieurs événements', async () => {
  sdk.payouts.retrieve.mockResolvedValue({
    id: 'po_test',
    status: 'paid',
    amount: 118163,
    currency: 'eur',
    created,
    arrival_date: created,
  })
  const body = event('payout.paid', undefined, { id: 'po_test', amount: 1 })
  await Promise.all([
    deliver(body).expect(200),
    deliver(event('payout.paid', undefined, { id: 'po_test' })).expect(200),
  ])
  expect(await AccountingEntry.countDocuments({ idempotencyKey: 'stripe:payout:po_test' })).toBe(1)
  expect(
    (await AccountingLine.find().sort({ sortIndex: 1 })).map((row) => [row.accountCode, row.debit, row.credit]),
  ).toEqual([
    ['512000', 1181.63, 0],
    ['512800', 0, 1181.63],
  ])
})

it('met contestations et virements échoués en revue sans écriture', async () => {
  await deliver(event('charge.dispute.created', undefined, { id: 'dp_test' })).expect(200)
  await deliver(event('payout.failed', undefined, { id: 'po_test' })).expect(200)
  expect(await StripeEvent.countDocuments({ status: 'NEEDS_REVIEW' })).toBe(2)
  expect(await AccountingEntry.countDocuments()).toBe(0)
})

it('ignore le paiement différé non payé et les types sans traitement', async () => {
  const body = event('checkout.session.completed', undefined, { id: 'cs_test', payment_status: 'unpaid' })
  await deliver(body).expect(200)
  await deliver(body).expect(200)
  await deliver(event('customer.created', undefined, { id: 'cus_test' })).expect(200)
  expect(await StripeEvent.countDocuments({ status: 'IGNORED' })).toBe(2)
  expect(await ProjectPayment.countDocuments()).toBe(0)
})

it('protège les gardes métier et les rapprochements Stripe sans écriture partielle', async () => {
  const cases = [
    async () => {
      pi.currency = 'usd'
    },
    async () => {
      pi.metadata = { invoiceId: String(new mongoose.Types.ObjectId()), linkId }
    },
    async () => {
      await BillingDocument.updateOne({ _id: invoiceId }, { status: 'CANCELLED' })
    },
    async () => {
      await BillingDocument.updateOne({ _id: invoiceId }, { status: 'PAID' })
    },
    async () => {
      await ChartOfAccount.deleteOne({ code: '512800' })
    },
    async () => {
      await FiscalYear.create({ code: 'FY-2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'CLOTURE' })
    },
  ]
  for (const change of cases) {
    await change()
    await deliver().expect(200)
    expect((await StripeEvent.findOne().sort({ createdAt: -1 }))!.status).toBe('NEEDS_REVIEW')
    expect(await ProjectPayment.countDocuments()).toBe(0)
    expect(await AccountingEntry.countDocuments()).toBe(0)
    pi.currency = 'eur'
    pi.metadata = { invoiceId, linkId }
    await BillingDocument.updateOne({ _id: invoiceId }, { status: 'SENT' })
    if (!(await ChartOfAccount.exists({ code: '512800' })))
      await ChartOfAccount.create({ code: '512800', label: 'Stripe', accountClass: 5, type: 'ACTIF' })
    await FiscalYear.deleteMany({})
  }
})

it('limite les données publiques et crée le Checkout au reste courant en expirant le précédent', async () => {
  const response = await request(app).get(`/api/public/pay/${token}`).expect(200)
  expect(response.body).toEqual({ number: 'FAC-STRIPE', payerName: 'Payeur', remainingTtcCents: 119988 })
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  await recordPayment({
    invoiceId,
    amountTtcCents: 40000,
    method: 'VIREMENT',
    receivedAt: new Date('2026-01-09'),
    idempotencyKey: 'manual',
    userId,
  })
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_new')
  const input = sdk.checkout.sessions.create.mock.calls.at(-1)![0]
  expect(input).toMatchObject({
    mode: 'payment',
    metadata: { invoiceId, linkId },
    payment_intent_data: { metadata: { invoiceId, linkId } },
  })
  expect(input.line_items[0].price_data).toMatchObject({ currency: 'eur', unit_amount: 79988 })
  expect((await InvoicePaymentLink.findById(linkId))!.currentCheckoutSessionId).toBe('cs_new')
})

it('refuse les factures inéligibles, un lien révoqué et un jeton inconnu', async () => {
  for (const status of ['PAID', 'CANCELLED', 'DRAFT']) {
    await BillingDocument.updateOne({ _id: invoiceId }, { status })
    await request(app).post(`/api/public/pay/${token}/checkout`).expect(409)
  }
  await BillingDocument.updateOne({ _id: invoiceId }, { status: 'SENT' })
  await request(app).delete(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(200)
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(409)
  await request(app).get('/api/public/pay/unknown').expect(404)
  await request(app).post('/api/public/pay/unknown/checkout').expect(404)
})

it('bloque Checkout et le webhook pendant un avoir en brouillon', async () => {
  const original = (await BillingDocument.findById(invoiceId))!
  await BillingDocument.create({
    ...original.toObject(),
    _id: new mongoose.Types.ObjectId(),
    number: 'AV-STRIPE',
    status: 'DRAFT',
    creditedInvoice: invoiceId,
    subtotal: -999.9,
    taxTotal: -199.98,
    total: -1199.88,
    lines: [{ description: 'Avoir', quantity: 1, unitPrice: -999.9, taxRate: 20, total: -999.9 }],
  })
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(409)
  await deliver().expect(200)
  expect((await StripeEvent.findOne())!.status).toBe('NEEDS_REVIEW')
  expect(await ProjectPayment.countDocuments()).toBe(0)
})

it('importe refund.updated à partir de l’API et signale un encaissement d’origine absent', async () => {
  const refund = {
    id: 're_updated',
    charge: 'ch_test',
    payment_intent: 'pi_test',
    currency: 'eur',
    amount: 10000,
    status: 'succeeded',
    created: created + 1,
  }
  sdk.refunds.retrieve.mockResolvedValue(refund)
  sdk.refunds.list.mockReturnValue({
    async *[Symbol.asyncIterator]() {
      yield refund
    },
  })
  const body = event('charge.refund.updated', undefined, { id: 're_updated', status: 'pending', amount: 1 })
  await deliver(body).expect(200)
  const review = (await StripeEvent.findOne())!
  expect(review.status).toBe('NEEDS_REVIEW')
  expect(await ProjectPayment.countDocuments()).toBe(0)
  await deliver().expect(200)
  sdk.events.retrieve.mockResolvedValue(body)
  await request(app).post(`/accounting/stripe/events/${review._id}/retry`).set('Cookie', cookie).expect(200)
  expect((await ProjectPayment.findOne({ kind: 'REFUND' }))!.amountTtcCents).toBe(-10000)
})

it('omet la ligne de frais nuls et ne fait pas confiance à une transaction de solde incohérente', async () => {
  const balance = (pi.latest_charge as { balance_transaction: { amount: number; fee: number; net: number } })
    .balance_transaction
  balance.fee = 0
  await deliver().expect(200)
  expect((await StripeEvent.findOne())!.status).toBe('NEEDS_REVIEW')
  balance.net = 119988
  await deliver().expect(200)
  expect(await AccountingLine.countDocuments({ accountCode: '627800' })).toBe(0)
  expect((await AccountingLine.findOne({ accountCode: '512800' }))!.debit).toBe(1199.88)
})

it('annule l’événement et l’encaissement si l’écriture des parts échoue', async () => {
  const save = vi.spyOn(ShareAllocation.prototype, 'save').mockRejectedValueOnce(new Error('database unavailable'))
  const body = event()
  try {
    await deliver(body).expect(500)
  } finally {
    save.mockRestore()
  }
  expect(await ProjectPayment.countDocuments()).toBe(0)
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await StripeEvent.countDocuments()).toBe(0)
  await deliver(body).expect(200)
  expect(await ProjectPayment.countDocuments()).toBe(1)
})

it('expire une session créée pendant une révocation concurrente', async () => {
  sdk.checkout.sessions.create.mockImplementationOnce(async () => {
    await request(app).delete(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(200)
    return { id: 'cs_revoked', url: 'https://checkout.stripe.com/test' }
  })
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(409)
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_revoked')
  expect((await InvoicePaymentLink.findById(linkId))!.revokedAt).not.toBeNull()
})

it('renouvelle une tentative Stripe expirée après un échec de rattachement', async () => {
  sdk.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_abandoned', url: 'https://checkout.stripe.com/old' })
  sdk.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_recovered', url: 'https://checkout.stripe.com/new' })
  sdk.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_abandoned', status: 'expired' })
  const response = await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  expect(response.body.url).toBe('https://checkout.stripe.com/new')
  const calls = sdk.checkout.sessions.create.mock.calls
  expect(calls[0]![1].idempotencyKey).not.toBe(calls[1]![1].idempotencyKey)
  expect((await InvoicePaymentLink.findById(linkId))!.currentCheckoutSessionId).toBe('cs_recovered')
})

it('refuse un encaissement si une nouvelle session apparaît après l’expiration préalable', async () => {
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  sdk.checkout.sessions.create.mockResolvedValueOnce({
    id: 'cs_concurrent',
    url: 'https://checkout.stripe.com/concurrent',
  })
  sdk.checkout.sessions.retrieve.mockImplementationOnce(async () => {
    await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
    return { id: 'cs_new', status: 'open' }
  })
  const input = {
    invoiceId,
    amountTtcCents: 40000,
    method: 'VIREMENT' as const,
    receivedAt: new Date('2026-01-09'),
    idempotencyKey: 'race',
    userId,
  }
  await expect(recordPayment(input)).rejects.toMatchObject({ status: 409 })
  expect(await ProjectPayment.countDocuments()).toBe(0)
  expect((await InvoicePaymentLink.findById(linkId))!.currentCheckoutSessionId).toBe('cs_concurrent')
  await recordPayment(input)
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_concurrent')
  expect(await ProjectPayment.countDocuments()).toBe(1)
})

it('garde les jetons chiffrés, renouvelle et protège la gestion par les permissions', async () => {
  const oldToken = token
  const stored = (await InvoicePaymentLink.findById(linkId))!
  expect(stored.tokenHash).not.toBe(token)
  expect(stored.tokenEncrypted).not.toContain(token)
  const get = await request(app).get(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(200)
  expect(get.body.url).toContain(token)
  await createLink()
  expect(token).not.toBe(oldToken)
  await request(app).get(`/api/public/pay/${oldToken}`).expect(404)
  await User.updateOne({ _id: userId }, { role: 'ADMIN', deniedPermissions: ['view_accounting', 'manage_accounting'] })
  await request(app).get('/accounting/stripe/events').set('Cookie', cookie).expect(403)
  await request(app).get(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(403)
  await request(app).post(`/accounting/stripe/events/${stored._id}/retry`).set('Cookie', cookie).expect(403)
})

it('désactive les routes Stripe si une configuration manque sans arrêter l’application', async () => {
  for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PUBLIC_APP_URL']) {
    const previous = process.env[key]!
    vi.stubEnv(key, '')
    await deliver().expect(503)
    await request(app).get(`/api/public/pay/${token}`).expect(503)
    await request(app).post(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(503)
    await request(app).get('/health').expect(200)
    vi.stubEnv(key, previous)
  }
})

it('bloque une seconde session et un encaissement manuel tant qu’un paiement Stripe terminé n’est pas rapproché', async () => {
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_new', status: 'complete', payment_intent: 'pi_test' })
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(409)
  await request(app)
    .post(`/accounting/invoices/${invoiceId}/payments`)
    .set('Cookie', cookie)
    .send({
      amountTtcCents: 119988,
      method: 'VIREMENT',
      receivedAt: '2026-01-12',
      idempotencyKey: 'manual-during-stripe',
    })
    .expect(409)
  expect(await ProjectPayment.countDocuments()).toBe(0)
  const paid = event('checkout.session.completed', 'evt_reconcile', {
    id: 'cs_new',
    payment_status: 'paid',
    payment_intent: 'pi_test',
    metadata: { invoiceId, linkId },
  })
  await deliver(paid).expect(200)
  expect(await ProjectPayment.countDocuments({ stripePaymentIntentId: 'pi_test' })).toBe(1)
  expect((await BillingDocument.findById(invoiceId))!.status).toBe('PAID')
})

it('expire la session Checkout ouverte avant de créer un avoir', async () => {
  await request(app).post(`/api/public/pay/${token}/checkout`).expect(200)
  sdk.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_new', status: 'open' })
  sdk.checkout.sessions.expire.mockClear()
  await request(app)
    .post(`/accounting/invoices/${invoiceId}/credit-notes`)
    .set('Cookie', cookie)
    .send({ reason: 'Geste commercial' })
    .expect(201)
  expect(sdk.checkout.sessions.expire).toHaveBeenCalledWith('cs_new')
})

it('date l’encaissement Stripe au jour de la transaction de solde, pas à la création du PaymentIntent', async () => {
  const settled = created + 2 * 24 * 3600
  ;(pi.latest_charge as { balance_transaction: { created: number } }).balance_transaction.created = settled
  await deliver().expect(200)
  const payment = (await ProjectPayment.findOne({ stripePaymentIntentId: 'pi_test' }))!
  expect(payment.receivedAt.getTime()).toBe(settled * 1000)
})

it('refuse de créer un lien de paiement sans clé de chiffrement dédiée', async () => {
  vi.stubEnv('CREDENTIALS_KEY', '')
  await request(app).post(`/accounting/invoices/${invoiceId}/payment-link`).set('Cookie', cookie).expect(503)
})
