import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import fs from 'fs/promises'
import path from 'path'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import BillingDocument from '../models/BillingDocument.js'
import Document from '../models/Document.js'

let app: Express
let clientId: string
let projectId: string

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
  // Best-effort cleanup du dossier uploads/agent (créé pendant les tests)
  const dir = path.resolve(process.cwd(), 'uploads', 'agent')
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
})

beforeEach(async () => {
  await clearDb()
  await User.create({
    email: 'admin@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  const client = await User.create({
    email: 'cl@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Cl',
    role: 'CLIENT',
  })
  clientId = String(client._id)
  const project = await Project.create({
    name: 'Test project',
    client: client._id,
    budget: { amount: 1000, currency: 'EUR' },
  })
  projectId = String(project._id)
})

// ═════════════════════════════════════════════════════════════════════════
// BILLING
// ═════════════════════════════════════════════════════════════════════════

describe('Agent Billing / CRUD + transitions', () => {
  it('creates a QUOTE with auto-numbering and computed totals', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const res = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        type: 'QUOTE',
        project: projectId,
        lines: [
          { description: 'Setup', quantity: 1, unitPrice: 500, taxRate: 20 },
          { description: 'Conseil', quantity: 2, unitPrice: 250, taxRate: 10 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.type).toBe('QUOTE')
    expect(res.body.number).toMatch(/^DEV-\d{4}$/)
    expect(res.body.subtotal).toBe(500 + 500) // 1000
    expect(res.body.taxTotal).toBeCloseTo(500 * 0.2 + 500 * 0.1, 6) // 150
    expect(res.body.total).toBeCloseTo(1150, 6)
    expect(res.body.status).toBe('DRAFT')
  })

  it('creates an INVOICE with default line from project budget when no lines', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const res = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    expect(res.status).toBe(201)
    expect(res.body.lines).toHaveLength(1)
    expect(res.body.lines[0].unitPrice).toBe(1000)
    expect(res.body.subtotal).toBe(1000)
    expect(res.body.number).toMatch(/^FAC-\d{4}$/)
  })

  it('rejects unknown project', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const res = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'QUOTE', project: '507f1f77bcf86cd799439099' })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('INVALID_PROJECT')
  })

  it('rejects duplicate number', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const r1 = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'QUOTE', project: projectId, number: 'DUPLICATA' })
    expect(r1.status).toBe(201)
    const r2 = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId, number: 'DUPLICATA' })
    expect(r2.status).toBe(409)
    expect(r2.body.code).toBe('NUMBER_ALREADY_EXISTS')
  })

  it('runs the full status transitions DRAFT → ISSUED → SENT → PAID', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const created = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    const id = created.body._id

    const issued = await request(app)
      .post(`/api/v1/agent/billing/${id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(issued.status).toBe(200)
    expect(issued.body.status).toBe('ISSUED')
    expect(issued.body.issuedAt).toBeTruthy()

    const sent = await request(app)
      .post(`/api/v1/agent/billing/${id}/mark-sent`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(sent.status).toBe(200)
    expect(sent.body.status).toBe('SENT')

    const paid = await request(app)
      .post(`/api/v1/agent/billing/${id}/mark-paid`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(paid.status).toBe(200)
    expect(paid.body.status).toBe('PAID')
    expect(paid.body.paidAt).toBeTruthy()
  })

  it('rejects ISSUE from non-DRAFT state', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const c = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    await request(app)
      .post(`/api/v1/agent/billing/${c.body._id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    const again = await request(app)
      .post(`/api/v1/agent/billing/${c.body._id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(again.status).toBe(409)
    expect(again.body.code).toBe('INVALID_TRANSITION')
  })

  it('refuses to modify lines after issuing', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const c = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    await request(app)
      .post(`/api/v1/agent/billing/${c.body._id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    const bad = await request(app)
      .patch(`/api/v1/agent/billing/${c.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ lines: [{ description: 'changed', quantity: 1, unitPrice: 99 }] })
    expect(bad.status).toBe(409)
    expect(bad.body.code).toBe('IMMUTABLE_AFTER_DRAFT')
  })

  it('DELETE allowed only on DRAFT', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:billing'])
    const c = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'QUOTE', project: projectId })
    const del = await request(app)
      .delete(`/api/v1/agent/billing/${c.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)

    // Crée un autre, l'émet, puis tente delete → 409
    const c2 = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    await request(app)
      .post(`/api/v1/agent/billing/${c2.body._id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    const badDel = await request(app)
      .delete(`/api/v1/agent/billing/${c2.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(badDel.status).toBe(409)
    expect(await BillingDocument.countDocuments()).toBe(1)
  })

  it('GET /billing with status filter', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:billing', 'write:billing'])
    await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'QUOTE', project: projectId })
    const c = await request(app)
      .post('/api/v1/agent/billing')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ type: 'INVOICE', project: projectId })
    await request(app)
      .post(`/api/v1/agent/billing/${c.body._id}/issue`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))

    const drafts = await request(app)
      .get('/api/v1/agent/billing?status=DRAFT')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(drafts.body.total).toBe(1)
    const issued = await request(app)
      .get('/api/v1/agent/billing?status=ISSUED')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(issued.body.total).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═════════════════════════════════════════════════════════════════════════

describe('Agent Documents / upload + download + delete', () => {
  it('uploads a small file via base64 and stores it on disk', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:documents'])
    const content = Buffer.from('hello world', 'utf8').toString('base64')
    const res = await request(app)
      .post('/api/v1/agent/documents')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: projectId,
        type: 'FICHIER_PROJET',
        originalName: 'hello.txt',
        mimeType: 'text/plain',
        contentBase64: content,
      })
    expect(res.status).toBe(201)
    expect(res.body.originalName).toBe('hello.txt')
    expect(res.body.storagePath).toMatch(/^uploads\/agent\//)

    // Vérifie que le fichier physique existe
    const absPath = path.resolve(process.cwd(), res.body.storagePath)
    const onDisk = await fs.readFile(absPath, 'utf8')
    expect(onDisk).toBe('hello world')
  })

  it('downloads the file via /download', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:documents', 'write:documents'])
    const created = await request(app)
      .post('/api/v1/agent/documents')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: projectId,
        type: 'FICHIER_PROJET',
        originalName: 'note.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('Bonjour', 'utf8').toString('base64'),
      })
    const dl = await request(app)
      .get(`/api/v1/agent/documents/${created.body._id}/download`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(dl.status).toBe(200)
    expect(dl.text).toBe('Bonjour')
    expect(dl.headers['content-type']).toContain('text/plain')
    expect(dl.headers['content-disposition']).toContain('note.txt')
  })

  it('rejects oversized files (>5 MB applicative limit)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:documents'])
    // 5.2 MB de zéros : passe sous la limite JSON 8 MB (≈6.93 MB base64)
    // mais dépasse la limite applicative 5 MB → FILE_TOO_LARGE par notre handler.
    const bigBuf = Buffer.alloc(Math.floor(5.2 * 1024 * 1024), 0)
    const res = await request(app)
      .post('/api/v1/agent/documents')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: projectId,
        type: 'FICHIER_PROJET',
        originalName: 'big.bin',
        mimeType: 'application/octet-stream',
        contentBase64: bigBuf.toString('base64'),
      })
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('FILE_TOO_LARGE')
  })

  it('rejects when type unknown', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:documents'])
    const res = await request(app)
      .post('/api/v1/agent/documents')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: projectId,
        type: 'INVALID_TYPE',
        originalName: 'x.txt',
        mimeType: 'text/plain',
        contentBase64: 'aGVsbG8=',
      })
    expect(res.status).toBe(400)
  })

  it('deletes both DB record and physical file', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:documents', 'write:documents'])
    const created = await request(app)
      .post('/api/v1/agent/documents')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: projectId,
        type: 'FICHIER_PROJET',
        originalName: 'will-delete.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('bye', 'utf8').toString('base64'),
      })
    const absPath = path.resolve(process.cwd(), created.body.storagePath)
    await fs.access(absPath) // existe avant
    const del = await request(app)
      .delete(`/api/v1/agent/documents/${created.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    expect(await Document.countDocuments()).toBe(0)
    // La suppression disque est best-effort et asynchrone : attendre sa
    // convergence plutôt que dépendre d'un délai fixe sensible à la charge CI.
    await expect
      .poll(
        async () => {
          try {
            await fs.access(absPath)
            return true
          } catch {
            return false
          }
        },
        { timeout: 1_000 },
      )
      .toBe(false)
  })

  it('lists documents filtered by project + type', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:documents', 'write:documents'])
    for (const t of ['FICHIER_PROJET', 'FACTURE', 'DEVIS']) {
      await request(app)
        .post('/api/v1/agent/documents')
        .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
        .send({
          project: projectId,
          type: t,
          originalName: `${t}.txt`,
          mimeType: 'text/plain',
          contentBase64: 'aGVsbG8=',
        })
    }
    const all = await request(app)
      .get('/api/v1/agent/documents')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(all.body.total).toBe(3)

    const factures = await request(app)
      .get('/api/v1/agent/documents?type=FACTURE')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(factures.body.total).toBe(1)
    expect(factures.body.items[0].type).toBe('FACTURE')
  })
})
