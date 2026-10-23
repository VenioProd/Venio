import { EventEmitter } from 'node:events'
import { generateKeyPairSync, verify } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import MobileDevice from '../models/MobileDevice.js'
import User from '../models/User.js'

const transport = vi.hoisted(() => ({
  headers: {} as Record<string, string>,
  status: 200,
  payload: '',
  connect: vi.fn(),
}))
vi.mock('node:http2', () => ({ connect: transport.connect }))
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  transport.status = 200
  transport.connect.mockReset().mockImplementation(() =>
    Object.assign(new EventEmitter(), {
      closed: false,
      destroyed: false,
      close: vi.fn(),
      destroy: vi.fn(),
      unref: vi.fn(),
      request: (headers: Record<string, string>) => {
        transport.headers = headers
        const stream = Object.assign(new EventEmitter(), {
          setTimeout: vi.fn(),
          close: vi.fn(),
          setEncoding: vi.fn(),
          end: (payload: string) => {
            transport.payload = payload
            queueMicrotask(() => {
              stream.emit('response', { ':status': transport.status })
              stream.emit('data', '')
              stream.emit('end')
            })
          },
        })
        return stream
      },
    }),
  )
  vi.stubEnv('APNS_KEY_ID', 'test-key')
  vi.stubEnv('APNS_TEAM_ID', 'test-team')
  vi.stubEnv('APNS_BUNDLE_ID', 'test.bundle')
  vi.stubEnv('APNS_PRIVATE_KEY', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString().replace(/\n/g, '\\n'))
})
afterEach(() => vi.unstubAllEnvs())
async function device() {
  return MobileDevice.create({
    userId: new Types.ObjectId(),
    name: 'Test',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 60000),
    apnsToken: 'a'.repeat(64),
    apnsEnvironment: 'sandbox',
  })
}
it('signe un JWT ES256 vérifiable et réutilise la session et le JWT', async () => {
  const d = await device()
  const { sendApnsToUser } = await import('../lib/apns.js')
  await sendApnsToUser(String(d.userId), {
    title: 'Test',
    tag: 'CRM_LEAD_ASSIGNED',
    unreadCount: 2,
    data: { notificationId: '123', email: 'secret@test.invalid' },
  })
  const jwt = transport.headers.authorization!.replace('bearer ', '')
  const [header, claims, signature] = jwt.split('.')
  expect(
    verify(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature!, 'base64url'),
    ),
  ).toBe(true)
  expect(JSON.parse(Buffer.from(claims!, 'base64url').toString()).iss).toBe('test-team')
  expect(JSON.parse(transport.payload)).toEqual({
    aps: { alert: { title: 'Test', body: '' }, sound: 'default', badge: 2, 'thread-id': 'CRM_LEAD_ASSIGNED' },
    type: 'CRM_LEAD_ASSIGNED',
    link: '/',
    notificationId: '123',
  })
  await sendApnsToUser(String(d.userId), { title: 'Test' })
  expect(transport.headers.authorization).toBe(`bearer ${jwt}`)
  expect(transport.connect).toHaveBeenCalledTimes(1)
})
it('reste inactif sans configuration', async () => {
  vi.stubEnv('APNS_KEY_ID', '')
  const { sendApnsToUser } = await import('../lib/apns.js')
  await expect(sendApnsToUser(String(new Types.ObjectId()), { title: 'Test' })).resolves.toBeUndefined()
  expect(transport.connect).not.toHaveBeenCalled()
})
it('efface le jeton refusé en 410 sans toucher aux appareils inactifs', async () => {
  const d = await device()
  const inactive = await MobileDevice.create({
    userId: d.userId,
    name: 'Ancien',
    platform: 'ios',
    expiresAt: new Date(Date.now() - 1),
    apnsToken: 'b'.repeat(64),
    apnsEnvironment: 'sandbox',
  })
  transport.status = 410
  const { sendApnsToUser } = await import('../lib/apns.js')
  await sendApnsToUser(String(d.userId), { title: 'Test' })
  expect((await MobileDevice.findById(d._id))?.apnsToken).toBeNull()
  expect((await MobileDevice.findById(d._id))?.apnsEnvironment).toBeNull()
  expect((await MobileDevice.findById(inactive._id))?.apnsToken).toBe(inactive.apnsToken)
})
it('rédige le push dans la langue de l’utilisateur, avec repli sur le français', async () => {
  const user = await User.create({
    email: 'en@test.invalid',
    passwordHash: 'x',
    name: 'En',
    role: 'COMMERCIAL',
    appLocale: 'en',
  })
  await MobileDevice.create({
    userId: user._id,
    name: 'Test',
    platform: 'ios',
    expiresAt: new Date(Date.now() + 60000),
    apnsToken: 'c'.repeat(64),
    apnsEnvironment: 'sandbox',
  })
  const { sendApnsToUser } = await import('../lib/apns.js')
  const metadata = { projectName: 'Site Dupont', phaseTitle: 'Maquettes', actorName: 'Jeanne' }
  await sendApnsToUser(
    String(user._id),
    { title: 'Étape validée — Site Dupont', body: '…', tag: 'PHASE_VALIDATED' },
    metadata,
  )
  expect(JSON.parse(transport.payload).aps.alert).toEqual({
    title: 'Stage approved — Site Dupont',
    body: 'Jeanne approved the stage “Maquettes”.',
  })
  // Sans gabarit anglais, le texte français part tel quel.
  await sendApnsToUser(String(user._id), { title: 'Tâche assignée', body: 'Relire', tag: 'TASK_ASSIGNED' })
  expect(JSON.parse(transport.payload).aps.alert).toEqual({ title: 'Tâche assignée', body: 'Relire' })
})
