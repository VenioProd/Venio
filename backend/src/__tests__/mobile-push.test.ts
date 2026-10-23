import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { Types } from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import auth from '../middleware/auth.js'
import pushRoutes from '../routes/mobile/push.js'
import preferenceRoutes from '../routes/mobile/preferences.js'
import quoteRoutes from '../routes/client/quotes.js'
import crmRoutes from '../routes/admin/crm.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import MobileDevice from '../models/MobileDevice.js'
import Lead from '../models/Lead.js'
import Notification from '../models/Notification.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Project from '../models/Project.js'
import { createNotification } from '../lib/notifications.js'
import { setPreferences } from '../lib/notificationPreferences.js'
import { sendApnsToUser } from '../lib/apns.js'
import { processLeadFollowUps } from '../lib/crmScheduler.js'

vi.mock('../lib/webhookEvents.js', () => ({ emitWebhookEventInBackground: vi.fn() }))
vi.mock('../lib/webPush.js', () => ({ sendPushToUser: vi.fn() }))
vi.mock('../lib/apns.js', () => ({ sendApnsToUser: vi.fn() }))
vi.mock('../lib/quoteSignature.js', async (original) => ({
  ...(await original<typeof import('../lib/quoteSignature.js')>()),
  buildBillingDocumentForProposal: async () => ({ _id: new Types.ObjectId(), toObject: () => ({}) }),
}))
const app = express()
app.use(express.json())
app.use('/api/mobile/push', auth, pushRoutes)
app.use('/api/mobile/preferences', auth, preferenceRoutes)
app.use('/api/projects', quoteRoutes)
app.use('/api/admin/crm', crmRoutes)
beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)
async function user(role = 'COMMERCIAL') {
  return User.create({ email: `${new Types.ObjectId()}@test.invalid`, passwordHash: 'test', name: 'Test', role })
}
// Une session d'appareil ne circule qu'en Bearer, une session navigateur qu'en cookie.
async function cookie(userId: string, deviceId?: string): Promise<[string, string]> {
  if (deviceId) {
    const { token } = await createSession(userId, { deviceId, tokenPrefix: 'vnm_at_' })
    return ['Authorization', `Bearer ${token}`]
  }
  const { token } = await createSession(userId)
  return ['Cookie', `venio_session=${token}`]
}
async function device(userId: Types.ObjectId, extra = {}) {
  return MobileDevice.create({
    userId,
    name: 'App',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 60000),
    ...extra,
  })
}
it('déplace le jeton vers l’appareil courant et permet sa suppression', async () => {
  const owner = await user()
  const other = await device((await user())._id, { apnsToken: 'a'.repeat(64), apnsEnvironment: 'sandbox' })
  const current = await device(owner._id)
  const session = await cookie(String(owner._id), String(current._id))
  await request(app)
    .put('/api/mobile/push/apns')
    .set(...session)
    .send({ token: 'a'.repeat(64), environment: 'production' })
    .expect(204)
  expect((await MobileDevice.findById(other._id))?.apnsToken).toBeNull()
  expect((await MobileDevice.findById(current._id))?.apnsToken).toBe('a'.repeat(64))
  await request(app)
    .delete('/api/mobile/push/apns')
    .set(...session)
    .expect(204)
  expect((await MobileDevice.findById(current._id))?.apnsToken).toBeNull()
})
it('refuse l’enregistrement depuis une session navigateur', async () => {
  const response = await request(app)
    .put('/api/mobile/push/apns')
    .set(...(await cookie(String((await user())._id))))
    .send({ token: 'a'.repeat(64), environment: 'sandbox' })
    .expect(403)
  expect(response.body.code).toBe('DEVICE_REQUIRED')
})
it('enregistre et relit thème et langue, refuse un fond d’un autre thème', async () => {
  const session = await cookie(String((await user())._id))
  await request(app)
    .get('/api/mobile/preferences')
    .set(...session)
    .expect(200, { theme: 'glass', background: 'mist', accent: 'sky', locale: 'system' })
  const value = { theme: 'neon', background: 'abyss', accent: 'acid', locale: 'en' }
  await request(app)
    .put('/api/mobile/preferences')
    .set(...session)
    .send(value)
    .expect(200, value)
  await request(app)
    .get('/api/mobile/preferences')
    .set(...session)
    .expect(200, value)
  const response = await request(app)
    .put('/api/mobile/preferences')
    .set(...session)
    .send({ ...value, background: 'mist' })
    .expect(400)
  expect(response.body.code).toBe('INVALID_THEME')
})
it('réserve chaque échéance une seule fois et réarme après report', async () => {
  const assignedTo = (await user())._id
  const lead = await Lead.create({ company: 'Test', assignedTo, nextActionAt: new Date(Date.now() - 60000) })
  await Lead.create({ company: 'Ancien', assignedTo, nextActionAt: new Date(Date.now() - 8 * 86400000) })
  await Promise.all([processLeadFollowUps(), processLeadFollowUps()])
  expect(await Notification.countDocuments({ type: 'LEAD_FOLLOW_UP_DUE' })).toBe(1)
  await Lead.updateOne({ _id: lead._id }, { nextActionAt: new Date(Date.now() - 1000) })
  await processLeadFollowUps()
  expect(await Notification.countDocuments({ type: 'LEAD_FOLLOW_UP_DUE' })).toBe(2)
})
it('notifie le créateur une fois à la consultation puis à la signature', async () => {
  const owner = await user('CLIENT')
  const creator = await user()
  const project = await Project.create({ name: 'Test', client: owner._id })
  const proposal = await QuoteProposal.create({
    project: project._id,
    client: owner._id,
    createdBy: creator._id,
    title: 'Test',
    status: 'SENT',
  })
  const session = await cookie(String(owner._id))
  const url = `/api/projects/${project._id}/proposals/${proposal._id}`
  await Promise.all([
    request(app)
      .get(url)
      .set(...session)
      .expect(200),
    request(app)
      .get(url)
      .set(...session)
      .expect(200),
  ])
  expect(await Notification.countDocuments({ recipient: creator._id, type: 'QUOTE_PROPOSAL_VIEWED' })).toBe(1)
  await request(app)
    .post(`${url}/sign`)
    .set(...session)
    .send({ signerName: 'Test Client', consent: true })
    .expect(201)
  expect(await Notification.countDocuments({ recipient: creator._id, type: 'QUOTE_PROPOSAL_SIGNED' })).toBe(1)
})
it('notifie les changements d’assignation sans auto-notification ni doublon à la sauvegarde', async () => {
  const author = await user('SUPER_ADMIN')
  const assignee = await user()
  await CrmSettings.create({ emailOnAssignment: false })
  const session = await cookie(String(author._id))
  const response = await request(app)
    .post('/api/admin/crm/leads')
    .set(...session)
    .send({ company: 'Test', assignedTo: String(assignee._id) })
    .expect(201)
  const lead = (await Lead.findById(response.body.lead._id))!
  await lead.save()
  expect(await Notification.countDocuments({ recipient: assignee._id, type: 'CRM_LEAD_ASSIGNED' })).toBe(1)
  await request(app)
    .patch(`/api/admin/crm/leads/${lead._id}`)
    .set(...session)
    .send({ assignedTo: String(author._id) })
    .expect(200)
  expect(await Notification.countDocuments({ recipient: author._id, type: 'CRM_LEAD_ASSIGNED' })).toBe(0)
})

it('applique la préférence push commune à APNs', async () => {
  const recipient = String((await user())._id)
  vi.mocked(sendApnsToUser).mockClear()
  await setPreferences(recipient, { CRM_LEAD_ASSIGNED: { push: false } })
  await createNotification({ recipient, type: 'CRM_LEAD_ASSIGNED', title: 'Muet' })
  await setPreferences(recipient, { CRM_LEAD_ASSIGNED: { push: true } })
  await createNotification({ recipient, type: 'CRM_LEAD_ASSIGNED', title: 'Actif' })
  await vi.waitFor(() => expect(sendApnsToUser).toHaveBeenCalledTimes(1))
  expect(vi.mocked(sendApnsToUser).mock.calls[0]?.[1].title).toBe('Actif')
})
