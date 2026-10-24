import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import auth from '../middleware/auth.js'
import requireMfa from '../middleware/mfa.js'
import accountingRoutes from '../routes/admin/accounting/index.js'
import User from '../models/User.js'
import ProjectFinance from '../models/ProjectFinance.js'
import Project from '../models/Project.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import AuditLog from '../models/AuditLog.js'

const base = '/api/admin/accounting'
const app = express()
app.use(express.json())
app.use(base, auth, requireMfa, accountingRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let cookie: string
let adminId: string
let clientId: string
let projectId: string
let beneficiaryId: string
const financeUrl = () => `${base}/projects/${projectId}/finance`
const rulesUrl = () => `${base}/projects/${projectId}/share-rules`
const schedule = () => ({
  mode: 'ECHEANCIER',
  contractHtCents: 999999,
  vatRateBp: 2000,
  installments: [
    { label: 'Acompte', percentBp: 3000, trigger: { kind: 'DATE', dueDate: '2026-11-01' } },
    { label: 'Solde', percentBp: 7000, trigger: { kind: 'DATE', dueDate: '2026-12-01' } },
  ],
  payers: [{ kind: 'CLIENT', user: clientId, shareBp: 10000, isPrincipal: true, paymentMethod: 'VIREMENT' }],
})
async function cookieFor(id: string) {
  return `venio_session=${(await createSession(id, { mfaVerifiedAt: new Date() })).token}`
}
async function beneficiary() {
  const result = await request(app).post(`${base}/beneficiaries`).set('Cookie', cookie).send({
    kind: 'FREELANCE',
    displayName: 'Prestataire',
    defaultAccountCode: '604',
    settlementMode: 'BANQUE',
  })
  expect(result.status).toBe(201)
  return result.body.beneficiary._id as string
}
beforeAll(async () => {
  await setupMongoReplSet()
  await ProjectFinance.init()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash: 'unused', role: 'SUPER_ADMIN', twoFactorEnabled: true },
    { name: 'Client', email: 'client@example.test', passwordHash: 'unused', role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
  cookie = await cookieFor(adminId)
  projectId = String((await Project.create({ name: 'Site', client: clientId }))._id)
  await ChartOfAccount.create({ code: '604', label: 'Sous-traitance', accountClass: 6, type: 'CHARGE' })
})

it('refuse un échéancier à 99,99 %', async () => {
  const body = schedule()
  body.installments[1].percentBp = 6999
  await request(app).put(financeUrl()).set('Cookie', cookie).send(body).expect(400)
})
it('refuse deux payeurs principaux', async () => {
  const body = schedule()
  body.payers[0].shareBp = 5000
  body.payers.push({ ...body.payers[0] })
  await request(app).put(financeUrl()).set('Cookie', cookie).send(body).expect(400)
})
it('refuse des références de payeur incompatibles avec son type', async () => {
  const body = schedule()
  body.payers[0].user = adminId
  await request(app).put(financeUrl()).set('Cookie', cookie).send(body).expect(400)
})
it('refuse une répartition dépassant 100 %', async () => {
  beneficiaryId = await beneficiary()
  const other = await beneficiary()
  await request(app)
    .post(`${base}/share-templates`)
    .set('Cookie', cookie)
    .send({
      name: 'Trop',
      rules: [
        { beneficiary: beneficiaryId, bp: 6000 },
        { beneficiary: other, bp: 5000 },
      ],
    })
    .expect(400)
})
it.each(['inconnu', 'archivé'])('refuse un bénéficiaire %s dans les règles', async (state) => {
  beneficiaryId = String(new mongoose.Types.ObjectId())
  if (state === 'archivé') {
    beneficiaryId = await beneficiary()
    await request(app).post(`${base}/beneficiaries/${beneficiaryId}/archive`).set('Cookie', cookie).expect(200)
  }
  await request(app)
    .post(rulesUrl())
    .set('Cookie', cookie)
    .send({
      effectiveFrom: '2026-01-01',
      rules: [{ beneficiary: beneficiaryId, bp: 1000 }],
    })
    .expect(400)
})
it('refuse un bénéficiaire en doublon dans un modèle', async () => {
  beneficiaryId = await beneficiary()
  await request(app)
    .post(`${base}/share-templates`)
    .set('Cookie', cookie)
    .send({
      name: 'Doublon',
      rules: [
        { beneficiary: beneficiaryId, bp: 1000 },
        { beneficiary: beneficiaryId, bp: 2000 },
      ],
    })
    .expect(400)
})
it('remplace puis relit une configuration ECHEANCIER complète et trace les écritures', async () => {
  await request(app).put(financeUrl()).set('Cookie', cookie).send(schedule()).expect(200)
  const body = schedule()
  body.contractHtCents = 123456
  await request(app).put(financeUrl()).set('Cookie', cookie).send(body).expect(200)
  const result = await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)
  expect(result.body.finance.contractHtCents).toBe(123456)
  expect(result.body.finance.installments.map((i: { percentBp: number }) => i.percentBp)).toEqual([3000, 7000])
  expect(result.body.ruleVersion).toBeNull()
  expect(await mongoose.model('ProjectFinance').countDocuments({ project: projectId })).toBe(1)
  expect(
    await AuditLog.countDocuments({
      'metadata.entityType': 'ProjectFinance',
      'metadata.entityId': result.body.finance._id,
    }),
  ).toBe(2)
})
it('remplace un échéancier par un ABONNEMENT sans conserver ses échéances', async () => {
  await request(app).put(financeUrl()).set('Cookie', cookie).send(schedule()).expect(200)
  const subscription = { amountHtCents: 15000, period: 'MONTHLY', startDate: '2026-11-01', endDate: null }
  await request(app)
    .put(financeUrl())
    .set('Cookie', cookie)
    .send({ mode: 'ABONNEMENT', subscription, payers: schedule().payers })
    .expect(200)
  const result = await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)
  expect(result.body.finance.contractHtCents).toBeNull()
  expect(result.body.finance.installments).toEqual([])
  expect(result.body.finance.subscription.amountHtCents).toBe(15000)
})
it('refuse un abonnement dont la fin précède le début', async () => {
  await request(app)
    .put(financeUrl())
    .set('Cookie', cookie)
    .send({
      mode: 'ABONNEMENT',
      payers: schedule().payers,
      subscription: { amountHtCents: 15000, period: 'MONTHLY', startDate: '2026-11-01', endDate: '2026-10-01' },
    })
    .expect(400)
})
it('numérote les versions côté serveur et renvoie la version en vigueur', async () => {
  beneficiaryId = await beneficiary()
  const rules = [{ beneficiary: beneficiaryId, bp: 1000 }]
  const first = await request(app)
    .post(rulesUrl())
    .set('Cookie', cookie)
    .send({ version: 99, effectiveFrom: '2020-01-01', rules })
    .expect(201)
  const second = await request(app)
    .post(rulesUrl())
    .set('Cookie', cookie)
    .send({ effectiveFrom: '2099-01-01', rules })
    .expect(201)
  expect([first.body.version.version, second.body.version.version]).toEqual([1, 2])
  const list = await request(app).get(rulesUrl()).set('Cookie', cookie).expect(200)
  expect(list.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1])
  const result = await request(app).get(financeUrl()).set('Cookie', cookie).expect(200)
  expect(result.body.ruleVersion._id).toBe(first.body.version._id)
})
it('rend les versions immuables au niveau du modèle', async () => {
  const created = await request(app)
    .post(rulesUrl())
    .set('Cookie', cookie)
    .send({ effectiveFrom: '2020-01-01', rules: [] })
    .expect(201)
  const Model = mongoose.model('ShareRuleVersion')
  const doc = await Model.findById(created.body.version._id)
  doc!.set('reason', 'Modification')
  await expect(doc!.save()).rejects.toThrow(/immuable/i)
  await expect(Model.updateOne({ _id: doc!._id }, { reason: 'Modification' })).rejects.toThrow(/immuable/i)
  await expect(Model.findOneAndUpdate({ _id: doc!._id }, { reason: 'Modification' })).rejects.toThrow(/immuable/i)
})
it('répond 409 si une lecture concurrente tente de recréer la même version', async () => {
  const body = { effectiveFrom: '2020-01-01', rules: [] }
  const first = await request(app).post(rulesUrl()).set('Cookie', cookie).send(body).expect(201)
  const Model = mongoose.model('ShareRuleVersion')
  const staleRead = Model.findOne({ project: new mongoose.Types.ObjectId() })
  const read = vi.spyOn(Model, 'findOne').mockReturnValueOnce(staleRead)
  try {
    await request(app).post(rulesUrl()).set('Cookie', cookie).send(body).expect(409)
  } finally {
    read.mockRestore()
  }
  expect(await Model.countDocuments({ project: projectId })).toBe(1)
  expect((await Model.findById(first.body.version._id))!.version).toBe(1)
})
it('refuse la lecture à un ADMIN privé de view_accounting', async () => {
  const admin = await User.create({
    name: 'Restreint',
    email: 'restricted@example.test',
    passwordHash: 'unused',
    role: 'ADMIN',
    deniedPermissions: ['view_accounting'],
    twoFactorEnabled: true,
  })
  await request(app)
    .get(financeUrl())
    .set('Cookie', await cookieFor(String(admin._id)))
    .expect(403)
})
it('autorise la lecture au VIEWER et lui refuse toute écriture', async () => {
  const viewer = await User.create({
    name: 'Lecture',
    email: 'viewer@example.test',
    passwordHash: 'unused',
    role: 'VIEWER',
    twoFactorEnabled: true,
  })
  const viewerCookie = await cookieFor(String(viewer._id))
  await request(app).get(financeUrl()).set('Cookie', viewerCookie).expect(200)
  await request(app).put(financeUrl()).set('Cookie', viewerCookie).send(schedule()).expect(403)
})
it('refuse un compte comptable inexistant', async () => {
  const body = { kind: 'FREELANCE', displayName: 'Invalide', defaultAccountCode: 'inconnu', settlementMode: 'BANQUE' }
  await request(app).post(`${base}/beneficiaries`).set('Cookie', cookie).send(body).expect(400)
})
it('refuse un utilisateur client comme bénéficiaire', async () => {
  await request(app)
    .post(`${base}/beneficiaries`)
    .set('Cookie', cookie)
    .send({
      kind: 'FREELANCE',
      displayName: 'Client',
      defaultAccountCode: '604',
      settlementMode: 'BANQUE',
      user: clientId,
    })
    .expect(400)
})
it('refuse un projet inexistant', async () => {
  projectId = String(new mongoose.Types.ObjectId())
  await request(app).get(financeUrl()).set('Cookie', cookie).expect(404)
  await request(app).post(rulesUrl()).set('Cookie', cookie).send({ effectiveFrom: '2020-01-01', rules: [] }).expect(404)
})
