import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo } from '../__tests__/helpers/mongoTestEnv.js'
import { assertDemoDatabase, DEMO_MARKER, provisionAppReviewDemo } from './provisionAppReviewDemo.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import QuoteProposal, { allocateQuoteReference } from '../models/QuoteProposal.js'
import Interaction from '../models/Interaction.js'
import { canUseMobileApp } from '../lib/mobileAuth.js'
import { resolvePermissions } from '../lib/permissions.js'
import { hasProjectAccess } from '../lib/adminProjectAccess.js'

let uri: string
let directory: string
let credentialsPath: string
const previousMfa = process.env.MFA_ENABLED

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'app-review-'))
  credentialsPath = join(directory, 'credentials.json')
  process.env.MFA_ENABLED = 'false'
})

afterAll(async () => {
  await teardownMongo()
  await rm(directory, { recursive: true, force: true })
  if (previousMfa === undefined) delete process.env.MFA_ENABLED
  else process.env.MFA_ENABLED = previousMfa
})

it('refuse les environnements et URI dangereux avant toute connexion', async () => {
  expect(() => assertDemoDatabase('mongodb://localhost/demo', 'production')).toThrow('production')
  for (const unsafe of [
    'mongodb://localhost/production',
    'mongodb://prod-host/demo',
    'mongodb://localhost/%70rod',
    'mongodb://remote.example/main',
    'mongodb+srv://cluster.mongodb.net/demo',
  ])
    expect(() => assertDemoDatabase(unsafe, 'test')).toThrow()
  expect(() => assertDemoDatabase(undefined, 'test')).toThrow('APP_REVIEW_MONGODB_URI')
  expect(() => assertDemoDatabase('mongodb://localhost/main', 'test')).not.toThrow()
  expect(() => assertDemoDatabase('mongodb://staging.example/venio_demo', 'test')).not.toThrow()
  const connect = vi.spyOn(mongoose, 'connect')
  await expect(provisionAppReviewDemo({ uri: 'mongodb://127.0.0.1/production' })).rejects.toThrow('prod')
  expect(connect).not.toHaveBeenCalled()
  connect.mockRestore()
  process.env.MFA_ENABLED = 'true'
  await expect(provisionAppReviewDemo({ uri: 'mongodb://127.0.0.1/test' })).rejects.toThrow('MFA_ENABLED=false')
  expect(mongoose.connection.readyState).toBe(0)
  process.env.MFA_ENABLED = 'false'
})

it('rejoue deux fois sans doublons ni changement de mots de passe et donne accès mobile et documents', async () => {
  await setupMongo()
  uri = `mongodb://127.0.0.1:${mongoose.connection.port}/${mongoose.connection.name}`
  await mongoose.disconnect()
  const now = new Date('2026-11-12T09:00:00+01:00')
  await provisionAppReviewDemo({ uri, credentialsPath, now })
  const digest = async () =>
    createHash('sha256')
      .update(await readFile(credentialsPath))
      .digest('hex')
  const firstDigest = await digest()
  await mongoose.connect(uri)
  const firstUsers = await User.find().sort('_id').lean()
  await mongoose.disconnect()
  await provisionAppReviewDemo({ uri, credentialsPath, now })
  expect(await digest()).toBe(firstDigest)
  expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600)
  await mongoose.connect(uri)
  const secondUsers = await User.find().sort('_id').lean()
  expect(secondUsers.map((user) => String(user._id))).toEqual(firstUsers.map((user) => String(user._id)))
  expect(secondUsers.every((user, index) => user.passwordHash === firstUsers[index]!.passwordHash)).toBe(true)
  expect(secondUsers).toHaveLength(10)
  expect(await Lead.countDocuments({ notes: DEMO_MARKER })).toBe(8)
  expect(await QuoteProposal.countDocuments({ intro: DEMO_MARKER })).toBe(5)
  expect(await allocateQuoteReference(new Date('2026-10-23'))).toBe('DV-2026-042')
  expect(await Project.countDocuments({ tags: DEMO_MARKER })).toBe(5)
  expect(await Interaction.countDocuments()).toBe(4)
  const incoming = await Lead.findOne({ company: 'Studio Okami' }).lean()
  expect(incoming!.createdAt.toISOString()).toBe('2026-11-12T06:52:00.000Z')
  const lea = secondUsers.find((user) => user.email === 'lea@app-review.venio.test')!
  const admin = secondUsers.find((user) => user.email === 'admin@app-review.venio.test')!
  for (const user of [lea, admin]) {
    expect(canUseMobileApp(user.role)).toBe(true)
    expect(user.twoFactorEnabled).toBe(false)
  }
  expect(resolvePermissions(lea.role, lea.grantedPermissions, lea.deniedPermissions)).toContain(
    'upload_project_documents',
  )
  const project = await Project.findOne({ assignedTo: lea._id }).lean()
  expect(await hasProjectAccess({ id: String(lea._id), role: lea.role }, String(project!._id))).toBe(true)
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  expect(await bcrypt.compare(credentials.accounts.lea.password, lea.passwordHash)).toBe(true)
})
