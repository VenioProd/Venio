import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'

import { connectTestDb, disconnectTestDb } from './helpers/db.js'
import { seedPcg } from './helpers/seedPcg.js'
import { createTestAdmin, authHeader } from './helpers/auth.js'
import { makeEntry } from './helpers/factories.js'
import { createApp } from '../src/createApp.js'

import FiscalYear from '../src/models/FiscalYear.js'

const ROUTE = '/api/admin/accounting/entries'

let app
let token

beforeAll(async () => {
  await connectTestDb()
  app = createApp()
})

afterAll(async () => {
  await disconnectTestDb()
})

beforeEach(async () => {
  await seedPcg()
  const created = await createTestAdmin({ role: 'SUPER_ADMIN' })
  token = created.token
})

describe('POST /api/admin/accounting/entries', () => {
  it('lignes équilibrées (default DRAFT) → 201 status=DRAFT', async () => {
    const res = await request(app)
      .post(ROUTE)
      .set(authHeader(token))
      .send({
        journal: 'VE',
        date: '2026-03-15T10:00:00Z',
        label: 'Vente test',
        pieceRef: 'FA-001',
        lines: [
          { account: '411000', debit: 1200, credit: 0 },
          { account: '706000', debit: 0, credit: 1000 },
          { account: '445710', debit: 0, credit: 200 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.entry).toBeTruthy()
    expect(res.body.entry.status).toBe('DRAFT')
    expect(res.body.entry.totalDebit).toBe(1200)
    expect(res.body.entry.totalCredit).toBe(1200)
    expect(res.body.lines).toHaveLength(3)
  })

  it('lignes déséquilibrées → 400', async () => {
    const res = await request(app)
      .post(ROUTE)
      .set(authHeader(token))
      .send({
        journal: 'VE',
        date: '2026-03-15T10:00:00Z',
        label: 'Vente déséquilibrée',
        lines: [
          { account: '411000', debit: 1200, credit: 0 },
          { account: '706000', debit: 0, credit: 1000 },
        ],
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/déséquilibrée/i)
  })

  it('date dans exercice CLOTURE → 423', async () => {
    // On crée un exercice 2024 puis on le clôture explicitement
    const fy = await FiscalYear.create({
      code: 'FY-2024',
      label: 'Exercice 2024',
      startDate: new Date('2024-01-01T00:00:00Z'),
      endDate: new Date('2024-12-31T23:59:59Z'),
      status: 'CLOTURE',
      closedAt: new Date(),
    })
    expect(fy.status).toBe('CLOTURE')
    const res = await request(app)
      .post(ROUTE)
      .set(authHeader(token))
      .send({
        journal: 'VE',
        date: '2024-06-15T10:00:00Z',
        label: 'Tentative dans exercice clos',
        lines: [
          { account: '411000', debit: 100, credit: 0 },
          { account: '706000', debit: 0, credit: 100 },
        ],
      })
    expect(res.status).toBe(423)
  })
})

describe('POST /api/admin/accounting/entries/:id/validate', () => {
  it('DRAFT → VALIDATED avec validatedAt set', async () => {
    const { entry } = await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-15T10:00:00Z'),
      label: 'À valider',
      status: 'DRAFT',
      lines: [
        { account: '411000', debit: 200, credit: 0 },
        { account: '706000', debit: 0, credit: 200 },
      ],
    })
    const res = await request(app)
      .post(`${ROUTE}/${entry._id.toString()}/validate`)
      .set(authHeader(token))
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.entry.status).toBe('VALIDATED')
    expect(res.body.entry.validatedAt).toBeTruthy()
  })

  it('appelée 2 fois → 2e appel renvoie le doc VALIDATED sans erreur', async () => {
    const { entry } = await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-15T10:00:00Z'),
      label: 'Double validation',
      status: 'DRAFT',
      lines: [
        { account: '411000', debit: 50, credit: 0 },
        { account: '706000', debit: 0, credit: 50 },
      ],
    })
    const first = await request(app)
      .post(`${ROUTE}/${entry._id.toString()}/validate`)
      .set(authHeader(token))
      .send({})
    expect(first.status).toBe(200)
    expect(first.body.entry.status).toBe('VALIDATED')

    const second = await request(app)
      .post(`${ROUTE}/${entry._id.toString()}/validate`)
      .set(authHeader(token))
      .send({})
    expect(second.status).toBe(200)
    expect(second.body.entry.status).toBe('VALIDATED')
  })
})

describe('POST /api/admin/accounting/entries/bulk-validate', () => {
  it('mix valid/invalid → réponse avec results mixtes', async () => {
    const { entry: e1 } = await makeEntry({
      status: 'DRAFT',
      date: new Date('2026-03-01T10:00:00Z'),
      lines: [
        { account: '411000', debit: 100, credit: 0 },
        { account: '706000', debit: 0, credit: 100 },
      ],
    })
    const { entry: e2 } = await makeEntry({
      status: 'DRAFT',
      date: new Date('2026-03-02T10:00:00Z'),
      lines: [
        { account: '411000', debit: 200, credit: 0 },
        { account: '706000', debit: 0, credit: 200 },
      ],
    })
    const bogusId = '5f0f5f0f5f0f5f0f5f0f5f0f' // ObjectId valide mais qui n'existe pas

    const res = await request(app)
      .post(`${ROUTE}/bulk-validate`)
      .set(authHeader(token))
      .send({ ids: [e1._id.toString(), bogusId, e2._id.toString()] })
    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(3)
    const okFlags = res.body.results.map((r) => r.ok)
    expect(okFlags.filter(Boolean)).toHaveLength(2)
    expect(okFlags.filter((v) => v === false)).toHaveLength(1)
  })
})

describe('DELETE /api/admin/accounting/entries/:id', () => {
  it('DRAFT → 200', async () => {
    const { entry } = await makeEntry({
      status: 'DRAFT',
      date: new Date('2026-03-15T10:00:00Z'),
      lines: [
        { account: '411000', debit: 10, credit: 0 },
        { account: '706000', debit: 0, credit: 10 },
      ],
    })
    const res = await request(app)
      .delete(`${ROUTE}/${entry._id.toString()}`)
      .set(authHeader(token))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('VALIDATED → 400', async () => {
    const { entry } = await makeEntry({
      status: 'VALIDATED',
      date: new Date('2026-03-15T10:00:00Z'),
      lines: [
        { account: '411000', debit: 10, credit: 0 },
        { account: '706000', debit: 0, credit: 10 },
      ],
    })
    const res = await request(app)
      .delete(`${ROUTE}/${entry._id.toString()}`)
      .set(authHeader(token))
    expect(res.status).toBe(400)
  })
})
