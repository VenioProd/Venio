import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'

/**
 * Non-régression des routes leads de l'API agent (POST, PATCH, DELETE sur
 * /api/v1/agent/leads). Contrat HTTP actuel : codes, formes de réponse
 * (objet direct, sans enveloppe), effets en base.
 *
 * Particularités volontairement figées :
 *   - l'agent n'est pas soumis au périmètre utilisateur (leadScopeFilter) : il
 *     lit et écrit tous les leads, selon ses seuls scopes read:crm / write:crm ;
 *   - le lead créé par un agent est rattaché au premier SUPER_ADMIN.
 * Les comportements que l'audit du 6 novembre 2026 range parmi les bugs sont
 * en it.todo.
 */

let app: Express
let adminId: string

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const admin = await User.create({
    email: 'admin@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  adminId = String(admin._id)
})

const writeHeaders = (secret: string) => authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() })

async function agentLead(fields: Record<string, unknown> = {}) {
  return Lead.create({ company: 'Domaine Test', createdBy: adminId, ...fields })
}

describe('agent CRM leads / authentification et scopes', () => {
  it('401 sans jeton', async () => {
    await request(app).post('/api/v1/agent/leads').send({ company: 'X' }).expect(401)
    await request(app).get('/api/v1/agent/leads').expect(401)
  })

  it('403 sans le scope write:crm sur POST, PATCH et DELETE', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const lead = await agentLead()
    const post = await request(app).post('/api/v1/agent/leads').set(writeHeaders(plainSecret)).send({ company: 'X' })
    expect(post.status).toBe(403)
    const patch = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ notes: 'x' })
    expect(patch.status).toBe(403)
    const del = await request(app).delete(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret))
    expect(del.status).toBe(403)
    expect(await Lead.countDocuments()).toBe(1)
    expect((await Lead.findById(lead._id).lean())?.notes ?? '').toBe('')
  })

  it('403 avec le seul scope write:crm sur GET (lecture = read:crm)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app).get('/api/v1/agent/leads').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(403)
  })
})

describe('agent CRM leads / POST', () => {
  it('201 : objet lead direct, statut LEAD par défaut, rattaché au SUPER_ADMIN, non assigné', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: '  Agent Corp ', contactName: 'Alice', contactEmail: 'alice@example.com', project: 'VIGNO', budget: '1200' })
    expect(res.status).toBe(201)
    expect(res.body.lead).toBeUndefined()
    expect(res.body).toMatchObject({ company: 'Agent Corp', status: 'LEAD', project: 'VIGNO', budget: 1200, createdBy: adminId })
    expect(res.body.assignedTo ?? null).toBeNull()
    expect(res.body._id).toBeTruthy()
    const inDb = await Lead.findById(res.body._id).lean()
    expect(inDb?.company).toBe('Agent Corp')
    expect(String(inDb?.createdBy)).toBe(adminId)
  })

  it('accepte un statut, une priorité et une température valides', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: 'X', status: 'DEMO', priority: 'URGENTE', leadTemperature: 'CHAUD' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'DEMO', priority: 'URGENTE', leadTemperature: 'CHAUD' })
  })

  it('conserve l\'assignation demandée', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app)
      .post('/api/v1/agent/leads')
      .set(writeHeaders(plainSecret))
      .send({ company: 'X', assignedTo: adminId })
    expect(res.status).toBe(201)
    expect(res.body.assignedTo).toBe(adminId)
  })

  it.each([
    ['société absente', { contactName: 'x' }, null],
    ['société vide', { company: '' }, 'Le nom de société est requis'],
    ['statut inconnu', { company: 'X', status: 'WAT' }, null],
    ['priorité inconnue', { company: 'X', priority: 'WAT' }, null],
    ['température inconnue', { company: 'X', leadTemperature: 'WAT' }, null],
    ['e-mail invalide', { company: 'X', contactEmail: 'nope' }, 'Email invalide'],
    ['projet hors liste', { company: 'X', project: 'INCONNU' }, 'Projet invalide'],
    ['budget non numérique', { company: 'X', budget: 'beaucoup' }, null],
  ])('400 VALIDATION_ERROR : %s', async (_label, payload, message) => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app).post('/api/v1/agent/leads').set(writeHeaders(plainSecret)).send(payload)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(typeof res.body.error).toBe('string')
    expect(Array.isArray(res.body.details?.errors)).toBe(true)
    if (message) expect(res.body.error).toContain(message)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('500 NO_ADMIN quand aucun SUPER_ADMIN n\'existe pour porter la création', async () => {
    await User.deleteMany({})
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const res = await request(app).post('/api/v1/agent/leads').set(writeHeaders(plainSecret)).send({ company: 'X' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('NO_ADMIN')
  })

  it('rejoue la réponse d\'une création déjà reçue (Idempotency-Key) sans second lead', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const headers = writeHeaders(plainSecret)
    const first = await request(app).post('/api/v1/agent/leads').set(headers).send({ company: 'Une fois' })
    const second = await request(app).post('/api/v1/agent/leads').set(headers).send({ company: 'Une fois' })
    expect(first.status).toBe(201)
    expect(second.body._id).toBe(first.body._id)
    expect(await Lead.countDocuments()).toBe(1)
  })

  it.todo(
    'BUG audit : la création via l\'agent devrait appliquer l\'auto-qualification (budget + source => QUALIFIED) comme la route admin',
  )
})

describe('agent CRM leads / PATCH', () => {
  it('200 : objet lead direct, champs mis à jour, champs inconnus ignorés', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead()
    const res = await request(app)
      .patch(`/api/v1/agent/leads/${lead._id}`)
      .set(writeHeaders(plainSecret))
      .send({ company: 'Renommé', priority: 'HAUTE', budget: 5000, createdBy: String(new mongoose.Types.ObjectId()), foo: 'bar' })
    expect(res.status).toBe(200)
    expect(res.body.lead).toBeUndefined()
    expect(res.body).toMatchObject({ _id: String(lead._id), company: 'Renommé', priority: 'HAUTE', budget: 5000, createdBy: adminId })
    expect(res.body.foo).toBeUndefined()
  })

  it('un changement de statut met à jour statusChangedAt', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead({ statusChangedAt: new Date('2020-01-01T00:00:00Z') })
    const res = await request(app)
      .patch(`/api/v1/agent/leads/${lead._id}`)
      .set(writeHeaders(plainSecret))
      .send({ status: 'PROPOSAL' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PROPOSAL')
    expect(new Date(res.body.statusChangedAt).getFullYear()).toBeGreaterThan(2020)
  })

  it('un statut inchangé laisse statusChangedAt tel quel', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const when = new Date('2020-01-01T00:00:00Z')
    const lead = await agentLead({ statusChangedAt: when })
    await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ status: 'LEAD', notes: 'RAS' }).expect(200)
    expect((await Lead.findById(lead._id).lean())?.statusChangedAt?.toISOString()).toBe(when.toISOString())
  })

  it('un statut hors liste est ignoré (le PATCH réussit sans le changer)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead()
    const res = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ status: 'WAT', notes: 'x' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('LEAD')
  })

  it('assigne un lead (identifiant valide)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead()
    const res = await request(app)
      .patch(`/api/v1/agent/leads/${lead._id}`)
      .set(writeHeaders(plainSecret))
      .send({ assignedTo: adminId })
    expect(res.status).toBe(200)
    expect(res.body.assignedTo).toBe(adminId)
  })

  it('assignedTo mal formé ou vide désassigne le lead', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead({ assignedTo: adminId })
    const res = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ assignedTo: null })
    expect(res.status).toBe(200)
    expect(res.body.assignedTo ?? null).toBeNull()
  })

  it('404 NOT_FOUND pour un lead inexistant, 400 VALIDATION_ERROR pour un identifiant mal formé', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const missing = await request(app)
      .patch(`/api/v1/agent/leads/${new mongoose.Types.ObjectId()}`)
      .set(writeHeaders(plainSecret))
      .send({ notes: 'x' })
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('NOT_FOUND')
    const bad = await request(app).patch('/api/v1/agent/leads/pas-un-id').set(writeHeaders(plainSecret)).send({ notes: 'x' })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('VALIDATION_ERROR')
  })

  it('400 pour un projet hors liste, lead intact', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead({ project: 'VIGNO' })
    const res = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ project: 'INCONNU' })
    expect(res.status).toBe(400)
    expect((await Lead.findById(lead._id).lean())?.project).toBe('VIGNO')
  })

  it('n\'est pas soumis au périmètre utilisateur : modifie le lead de n\'importe quel commercial', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const commercial = await User.create({ email: 'c@venio.test', name: 'C', role: 'COMMERCIAL', passwordHash: 'x' })
    const lead = await agentLead({ createdBy: commercial._id, assignedTo: commercial._id })
    await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret)).send({ notes: 'via agent' }).expect(200)
    expect((await Lead.findById(lead._id).lean())?.notes).toBe('via agent')
  })

  it('rejoue la réponse d\'un PATCH déjà reçu (Idempotency-Key)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead()
    const headers = writeHeaders(plainSecret)
    const first = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(headers).send({ notes: 'a' })
    const second = await request(app).patch(`/api/v1/agent/leads/${lead._id}`).set(headers).send({ notes: 'a' })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body._id).toBe(first.body._id)
  })

  it.todo(
    'BUG audit : un changement de statut via l\'agent devrait journaliser STATUS_CHANGE { from, to } (aujourd\'hui aucune LeadActivity n\'est écrite par l\'API agent)',
  )
  it.todo(
    'BUG audit : lostReason / lostComment envoyés à l\'agent sont ignorés sans erreur ; ils devraient être validés contre la liste fermée comme sur la route admin',
  )
  it.todo(
    'BUG audit : un lead passé à WON via l\'agent devrait déclencher la conversion client/projet une seule fois, comme la route admin',
  )
})

describe('agent CRM leads / DELETE', () => {
  it('200 { ok: true, deletedId } et le lead disparaît', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const lead = await agentLead()
    const res = await request(app).delete(`/api/v1/agent/leads/${lead._id}`).set(writeHeaders(plainSecret))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, deletedId: String(lead._id) })
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('404 NOT_FOUND pour un lead inexistant, 400 pour un identifiant mal formé', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const missing = await request(app).delete(`/api/v1/agent/leads/${new mongoose.Types.ObjectId()}`).set(writeHeaders(plainSecret))
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('NOT_FOUND')
    const bad = await request(app).delete('/api/v1/agent/leads/pas-un-id').set(writeHeaders(plainSecret))
    expect(bad.status).toBe(400)
  })

  it('supprime le lead d\'un commercial sans contrôle de périmètre et épargne les autres', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm'])
    const commercial = await User.create({ email: 'c@venio.test', name: 'C', role: 'COMMERCIAL', passwordHash: 'x' })
    const target = await agentLead({ company: 'Cible', createdBy: commercial._id, assignedTo: commercial._id })
    await agentLead({ company: 'Autre' })
    await request(app).delete(`/api/v1/agent/leads/${target._id}`).set(writeHeaders(plainSecret)).expect(200)
    const left = await Lead.find().lean()
    expect(left.map((l) => l.company)).toEqual(['Autre'])
  })
})

describe('agent CRM leads / lecture', () => {
  it('GET /leads liste paginée {items,total} et GET /leads/:id objet direct', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const lead = await agentLead({ company: 'Lisible', status: 'DEMO' })
    const list = await request(app).get('/api/v1/agent/leads?status=DEMO').set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].company).toBe('Lisible')
    const detail = await request(app).get(`/api/v1/agent/leads/${lead._id}`).set('Authorization', `Bearer ${plainSecret}`)
    expect(detail.status).toBe(200)
    expect(detail.body.company).toBe('Lisible')
    const none = await request(app).get(`/api/v1/agent/leads/${new mongoose.Types.ObjectId()}`).set('Authorization', `Bearer ${plainSecret}`)
    expect(none.status).toBe(404)
  })

  it('l\'agent voit les leads de tous les rôles (pas de périmètre)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const other = await User.create({ email: 'a@venio.test', name: 'A', role: 'ADMIN', passwordHash: 'x' })
    await agentLead({ company: 'A', createdBy: other._id })
    await agentLead({ company: 'B' })
    const list = await request(app).get('/api/v1/agent/leads').set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.total).toBe(2)
    expect(await LeadActivity.countDocuments()).toBe(0)
  })
})
