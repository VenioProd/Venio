import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import request from 'supertest'

import { connectTestDb, disconnectTestDb } from './helpers/db.js'
import { seedPcg } from './helpers/seedPcg.js'
import { createTestAdmin, authHeader } from './helpers/auth.js'
import { makeEntry } from './helpers/factories.js'
import { createApp } from '../src/createApp.js'

import AccountingLine from '../src/models/AccountingLine.js'

const ROUTE = '/api/admin/accounting/lettrage'

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

/**
 * Crée deux écritures VALIDATED qui produisent 2 lignes sur le compte 411000
 * — l'une au débit, l'autre au crédit — utilisables pour les tests de lettrage.
 *
 * @param {Object} options
 * @param {number} [options.debitAmount=1000]
 * @param {number} [options.creditAmount=1000]
 * @returns {Promise<{ debitLine: object, creditLine: object }>}
 */
async function makeTwoLinesOn411({ debitAmount = 1000, creditAmount = 1000 } = {}) {
  // Écriture de vente : 411 D / 706 C
  await makeEntry({
    journalCode: 'VE',
    date: new Date('2026-03-10T10:00:00Z'),
    label: 'Vente 411',
    status: 'VALIDATED',
    lines: [
      { account: '411000', debit: debitAmount, credit: 0 },
      { account: '706000', debit: 0, credit: debitAmount },
    ],
  })
  // Écriture d'encaissement : 512 D / 411 C
  await makeEntry({
    journalCode: 'BQ',
    date: new Date('2026-03-20T10:00:00Z'),
    label: 'Encaissement 411',
    status: 'VALIDATED',
    lines: [
      { account: '512000', debit: creditAmount, credit: 0 },
      { account: '411000', debit: 0, credit: creditAmount },
    ],
  })
  const lines = await AccountingLine.find({ accountCode: '411000' }).sort({ date: 1 }).lean()
  expect(lines).toHaveLength(2)
  return { debitLine: lines[0], creditLine: lines[1] }
}

describe('POST /api/admin/accounting/lettrage', () => {
  it('2 lignes équilibrées sur 411 → 201 balanced=true', async () => {
    const { debitLine, creditLine } = await makeTwoLinesOn411({ debitAmount: 1000, creditAmount: 1000 })
    const res = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [debitLine._id.toString(), creditLine._id.toString()] })
    expect(res.status).toBe(201)
    expect(res.body.balanced).toBe(true)
    expect(res.body.partial).toBe(false)
    expect(res.body.lineCount).toBe(2)
    expect(typeof res.body.code).toBe('string')
    expect(res.body.code.length).toBeGreaterThan(0)
  })

  it('2 lignes déséquilibrées sur 411 → 201 partial=true', async () => {
    const { debitLine, creditLine } = await makeTwoLinesOn411({ debitAmount: 1000, creditAmount: 600 })
    const res = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [debitLine._id.toString(), creditLine._id.toString()] })
    expect(res.status).toBe(201)
    expect(res.body.balanced).toBe(false)
    expect(res.body.partial).toBe(true)
  })

  it('1 seule ligne → 400 (refusé pour cohérence métier)', async () => {
    const { debitLine } = await makeTwoLinesOn411()
    const res = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [debitLine._id.toString()] })
    expect(res.status).toBe(400)
  })

  it('lignes sur 2 comptes différents → 400', async () => {
    // Écritures distinctes touchant 411 + 401
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-10T10:00:00Z'),
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 500, credit: 0 },
        { account: '706000', debit: 0, credit: 500 },
      ],
    })
    await makeEntry({
      journalCode: 'AC',
      date: new Date('2026-03-11T10:00:00Z'),
      status: 'VALIDATED',
      lines: [
        { account: '604000', debit: 300, credit: 0 },
        { account: '401000', debit: 0, credit: 300 },
      ],
    })
    const lineOn411 = await AccountingLine.findOne({ accountCode: '411000' }).lean()
    const lineOn401 = await AccountingLine.findOne({ accountCode: '401000' }).lean()
    expect(lineOn411).toBeTruthy()
    expect(lineOn401).toBeTruthy()
    const res = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [lineOn411._id.toString(), lineOn401._id.toString()] })
    expect(res.status).toBe(400)
  })

  it('compte non lettrable (706000) → 400', async () => {
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-10T10:00:00Z'),
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 500, credit: 0 },
        { account: '706000', debit: 0, credit: 500 },
      ],
    })
    await makeEntry({
      journalCode: 'VE',
      date: new Date('2026-03-12T10:00:00Z'),
      status: 'VALIDATED',
      lines: [
        { account: '411000', debit: 200, credit: 0 },
        { account: '706000', debit: 0, credit: 200 },
      ],
    })
    const lines706 = await AccountingLine.find({ accountCode: '706000' }).lean()
    expect(lines706.length).toBeGreaterThanOrEqual(2)
    const res = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [lines706[0]._id.toString(), lines706[1]._id.toString()] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/lettrable/i)
  })
})

describe('DELETE /api/admin/accounting/lettrage/account/:accountCode/:code', () => {
  it('délettre un code → lignes redeviennent non lettrées', async () => {
    const { debitLine, creditLine } = await makeTwoLinesOn411()
    const letRes = await request(app)
      .post(`${ROUTE}/`)
      .set(authHeader(token))
      .send({ lineIds: [debitLine._id.toString(), creditLine._id.toString()] })
    expect(letRes.status).toBe(201)
    const code = letRes.body.code

    const delRes = await request(app)
      .delete(`${ROUTE}/account/411000/${code}`)
      .set(authHeader(token))
    expect(delRes.status).toBe(200)
    expect(delRes.body.unlinked).toBe(2)

    const linesAfter = await AccountingLine.find({ accountCode: '411000' }).lean()
    for (const line of linesAfter) {
      expect(line.lettrage).toBe('')
      expect(line.lettrageDate).toBeNull()
    }
  })
})
