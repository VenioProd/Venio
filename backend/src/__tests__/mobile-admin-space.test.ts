import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import auth from '../middleware/auth.js'
import requireMfa from '../middleware/mfa.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import billingRoutes from '../routes/admin/billing.js'
import devRoutes from '../routes/admin/dev/index.js'
import messagingRoutes from '../routes/admin/messaging.js'
import User from '../models/User.js'
import MobileDevice from '../models/MobileDevice.js'
import Project from '../models/Project.js'
import ProjectPayment from '../models/ProjectPayment.js'
import BillingDocument from '../models/BillingDocument.js'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import InternalConversation from '../models/InternalConversation.js'
import InternalMessage from '../models/InternalMessage.js'
import Notification from '../models/Notification.js'
import { sendInvoiceReminderEmail } from '../lib/email.js'
import { sendPushToUser } from '../lib/webPush.js'
import type { UserRole } from '../types/enums.js'

vi.mock('../lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/email.js')>()),
  sendInvoiceReminderEmail: vi.fn(),
}))
vi.mock('../lib/webPush.js', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

const app = express().use(express.json())
app.use('/api/admin/accounting', auth, requireMfa, accountingRoutes)
app.use('/api/admin/billing', billingRoutes)
app.use('/api/admin/dev', devRoutes)
app.use('/api/admin/messaging', messagingRoutes)

let author: string
let project: string
let bearer: string

async function deviceSession(userId: string, mfaVerifiedAt?: Date) {
  const device = await MobileDevice.create({
    userId,
    name: 'iPhone test',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 30 * 86400000),
    mfaVerifiedAt,
  })
  const session = await createSession(userId, {
    deviceId: String(device._id),
    tokenPrefix: 'vnm_at_',
    mfaVerifiedAt,
  })
  return `Bearer ${session.token}`
}

async function userSession(role: UserRole = 'ADMIN') {
  const user = await User.create({
    name: role,
    email: `${role}@test.invalid`,
    passwordHash: 'x',
    role,
    twoFactorEnabled: true,
  })
  return { user, bearer: await deviceSession(String(user._id)) }
}

async function payment(
  invoice: mongoose.Types.ObjectId,
  amountTtcCents: number,
  receivedAt: Date,
  refundOf?: mongoose.Types.ObjectId,
) {
  return ProjectPayment.create({
    project,
    invoice,
    kind: refundOf ? 'REFUND' : 'PAYMENT',
    amountTtcCents,
    htCents: Math.trunc(amountTtcCents / 1.2),
    method: 'VIREMENT',
    receivedAt,
    reason: refundOf ? 'Remboursement' : '',
    refundOf,
    entry: new mongoose.Types.ObjectId(),
    source: 'MANUAL',
    idempotencyKey: randomUUID(),
    requestHash: 'test',
    createdBy: author,
  })
}

beforeAll(async () => {
  await setupMongo()
  await UserIdempotencyKey.init()
})
afterAll(teardownMongo)
afterEach(() => vi.unstubAllEnvs())
beforeEach(async () => {
  vi.stubEnv('MFA_ENABLED', 'false')
  vi.clearAllMocks()
  vi.mocked(sendInvoiceReminderEmail).mockResolvedValue({ sent: true })
  await clearDb()
  const session = await userSession()
  author = String(session.user._id)
  bearer = session.bearer
  project = String((await Project.create({ name: 'Site', client: author, assignedTo: author }))._id)
})

it('exige la MFA de l’appareil pour les seules lectures comptables autorisées, sans limite de quinze minutes', async () => {
  vi.stubEnv('MFA_ENABLED', 'true')
  const missing = await request(app)
    .get('/api/admin/accounting/reports/dashboard')
    .set('Authorization', bearer)
    .expect(403)
  expect(missing.body.error).toBe('MFA_STEP_UP_REQUIRED')

  const oldMfa = new Date(Date.now() - 2 * 86400000)
  const verified = await deviceSession(author, oldMfa)
  await request(app).get('/api/admin/accounting/reports/dashboard').set('Authorization', verified).expect(200)
  await request(app).get('/API/ADMIN/ACCOUNTING/REPORTS/DASHBOARD/').set('Authorization', verified).expect(200)
  const browser = await createSession(author, { mfaVerifiedAt: oldMfa })
  const stale = await request(app)
    .get('/api/admin/accounting/reports/dashboard')
    .set('Cookie', `venio_session=${browser.token}`)
    .expect(403)
  expect(stale.body.error).toBe('MFA_STEP_UP_REQUIRED')

  for (const [method, path] of [
    ['get', '/api/admin/accounting/entries'],
    ['post', '/api/admin/accounting/beneficiaries'],
    ['post', '/api/admin/accounting/reports/dashboard'],
    ['get', '/api/admin/accounting/reports/dashboard/other'],
    ['get', '/api/admin/dev/issues/not-an-objectid'],
  ] as const) {
    const denied = await request(app)[method](path).set('Authorization', verified).expect(403)
    expect(denied.body.code).toBe('BROWSER_SESSION_REQUIRED')
  }
})

it('applique les permissions comptables et dev aux sessions Bearer', async () => {
  const commercial = await userSession('COMMERCIAL')
  const cashIn = await request(app)
    .get('/api/admin/accounting/project-finance/cash-in')
    .set('Authorization', commercial.bearer)
    .expect(403)
  expect(cashIn.body).toEqual({ error: 'Forbidden' })
  const issue = await request(app)
    .patch(`/api/admin/dev/issues/${new mongoose.Types.ObjectId()}`)
    .set('Authorization', commercial.bearer)
    .send({ status: 'DONE' })
    .expect(403)
  expect(issue.body).toEqual({ error: 'Forbidden' })
})

it('additionne encaissements et remboursements par mois UTC, avec les mois vides', async () => {
  const now = new Date()
  const month = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  const invoice = new mongoose.Types.ObjectId()
  const first = await payment(invoice, 12001, month(-1))
  await payment(invoice, 24002, month(0))
  await payment(invoice, -3001, month(0), first._id as mongoose.Types.ObjectId)
  const result = await request(app)
    .get('/api/admin/accounting/project-finance/cash-in?months=6')
    .set('Authorization', bearer)
    .expect(200)
  expect(result.body).toEqual({
    months: Array.from({ length: 6 }, (_, index) => ({
      month: month(index - 5)
        .toISOString()
        .slice(0, 7),
      receivedTtcCents: index === 4 ? 12001 : index === 5 ? 24002 : 0,
      refundedTtcCents: index === 5 ? 3001 : 0,
      netTtcCents: index === 4 ? 12001 : index === 5 ? 21001 : 0,
    })),
  })
  const defaultRange = await request(app)
    .get('/api/admin/accounting/project-finance/cash-in')
    .set('Authorization', bearer)
    .expect(200)
  expect(defaultRange.body.months).toHaveLength(12)
  expect(defaultRange.body.months[0].month).toBe(month(-11).toISOString().slice(0, 7))
  expect(defaultRange.body.months.slice(-6)).toEqual(result.body.months)
  await request(app)
    .get('/api/admin/accounting/project-finance/cash-in?months=7')
    .set('Authorization', bearer)
    .expect(400)
})

it('relance seulement une facture échue, sans écriture si SMTP échoue et sans second envoi au rejeu', async () => {
  const invoice = await BillingDocument.create({
    type: 'INVOICE',
    number: 'FAC-TEST-1',
    project,
    client: author,
    createdBy: author,
    status: 'PARTIALLY_PAID',
    subtotal: 100,
    taxTotal: 20,
    total: 120,
    dueAt: new Date(Date.now() + 86400000),
    payer: {
      payerId: new mongoose.Types.ObjectId(),
      kind: 'THIRD_PARTY',
      billingContact: { name: 'Payeur', email: 'payer@test.invalid' },
    },
  })
  const path = `/api/admin/billing/${invoice._id}/remind`
  const notDue = await request(app).post(path).set('Authorization', bearer).expect(409)
  expect(notDue.body.code).toBe('INVOICE_NOT_OVERDUE')
  expect(sendInvoiceReminderEmail).not.toHaveBeenCalled()
  await BillingDocument.updateOne({ _id: invoice._id }, { $set: { dueAt: new Date(Date.now() - 2 * 86400000) } })
  await payment(invoice._id as mongoose.Types.ObjectId, 2500, new Date())
  vi.mocked(sendInvoiceReminderEmail).mockResolvedValueOnce({ sent: false, error: 'SMTP absent' })
  const unavailable = await request(app).post(path).set('Authorization', bearer).expect(503)
  expect(unavailable.body.code).toBe('EMAIL_UNAVAILABLE')
  expect((await BillingDocument.findById(invoice._id))?.reminderSentAt).toBeNull()
  vi.mocked(sendInvoiceReminderEmail).mockClear()

  const key = randomUUID()
  const first = await request(app).post(path).set('Authorization', bearer).set('Idempotency-Key', key).expect(200)
  const replay = await request(app).post(path).set('Authorization', bearer).set('Idempotency-Key', key).expect(200)
  expect(replay.body).toEqual(first.body)
  expect(sendInvoiceReminderEmail).toHaveBeenCalledExactlyOnceWith({
    to: 'payer@test.invalid',
    name: 'Payeur',
    invoiceNumber: invoice.number,
    amount: '95 EUR',
    daysPastDue: 2,
  })
  expect(first.body.document.reminderSentAt).toBeTruthy()
  expect((await BillingDocument.findById(invoice._id))?.reminderSentAt?.toISOString()).toBe(
    first.body.document.reminderSentAt,
  )
})

it('rejoue un message sans créer de second message ni de seconde notification', async () => {
  const recipient = await User.create({
    name: 'Destinataire',
    email: 'recipient@test.invalid',
    passwordHash: 'x',
    role: 'ADMIN',
  })
  const conversation = await InternalConversation.create({
    type: 'CHANNEL',
    slug: 'test',
    name: 'Test',
    visibility: 'PUBLIC',
    createdBy: author,
  })
  const path = `/api/admin/messaging/conversations/${conversation._id}/messages`
  const key = randomUUID()
  const body = { content: `Bonjour @(${recipient._id})` }
  const first = await request(app)
    .post(path)
    .set('Authorization', bearer)
    .set('Idempotency-Key', key)
    .send(body)
    .expect(201)
  const replay = await request(app)
    .post(path)
    .set('Authorization', bearer)
    .set('Idempotency-Key', key)
    .send(body)
    .expect(201)
  expect(replay.body).toEqual(first.body)
  expect(await InternalMessage.countDocuments({ conversation: conversation._id })).toBe(1)
  expect(await Notification.countDocuments({ type: 'INTERNAL_MESSAGE', recipient: recipient._id })).toBe(1)
  expect(sendPushToUser).toHaveBeenCalledTimes(1)
})
