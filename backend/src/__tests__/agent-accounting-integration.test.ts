import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import User from '../models/User.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import VatRate from '../models/VatRate.js'
import FiscalYear from '../models/FiscalYear.js'
import VatDeclaration from '../models/VatDeclaration.js'
import ExternalSource from '../models/ExternalSource.js'
import ExternalTransaction from '../models/ExternalTransaction.js'

let app: Express
let adminId: string
let fyId: string
let journalId: string

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
    email: 'admin@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  adminId = String(admin._id)
  const fy = await FiscalYear.create({
    code: 'FY-2026',
    label: '2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'OUVERT',
  })
  fyId = String(fy._id)
  const j = await Journal.create({ code: 'VE', label: 'Ventes', type: 'VENTE' })
  journalId = String(j._id)
})

// ───────────────────────────────────────────────────────────────────────────
// Scopes : write:accounting n'existe pas — vérif que les routes sont RO
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Accounting / read-only enforcement', () => {
  it('all routes refuse without read:accounting', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm']) // scope inutile ici
    const paths = [
      '/api/v1/agent/accounting/entries',
      '/api/v1/agent/accounting/journals',
      '/api/v1/agent/accounting/chart-of-accounts',
      '/api/v1/agent/accounting/vat-rates',
      '/api/v1/agent/accounting/fiscal-years',
      '/api/v1/agent/accounting/vat-declarations',
      '/api/v1/agent/accounting/external-sources',
      '/api/v1/agent/accounting/external-transactions',
      '/api/v1/agent/accounting/dashboard',
    ]
    for (const p of paths) {
      const r = await request(app).get(p).set('Authorization', `Bearer ${plainSecret}`)
      expect(r.status).toBe(403)
      expect(r.body.code).toBe('INSUFFICIENT_SCOPE')
    }
  })

  it('POST/PATCH/DELETE on accounting routes is not exposed (404)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['admin:*'])
    const r = await request(app)
      .post('/api/v1/agent/accounting/entries')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ label: 'cheat' })
    expect(r.status).toBe(404)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Référentiels
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Accounting / référentiels', () => {
  it('lists journals, chart of accounts, vat rates, fiscal years', async () => {
    await Journal.create({ code: 'AC', label: 'Achats', type: 'ACHAT' })
    await ChartOfAccount.create([
      { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF', isActive: true },
      { code: '707000', label: 'Ventes', accountClass: 7, type: 'PRODUIT', isActive: true },
    ])
    await VatRate.create([
      { code: 'NORMAL', label: 'TVA 20%', rate: 20 },
      { code: 'INTERMEDIAIRE', label: 'TVA 10%', rate: 10 },
    ])

    const { plainSecret } = await createAgentTokenInDb(['read:accounting'])

    const journals = await request(app)
      .get('/api/v1/agent/accounting/journals')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(journals.body.items.length).toBe(2)
    expect(journals.body.items[0].code).toBe('AC')

    const coa = await request(app)
      .get('/api/v1/agent/accounting/chart-of-accounts?q=Clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(coa.body.total).toBe(1)
    expect(coa.body.items[0].code).toBe('411000')

    const vat = await request(app)
      .get('/api/v1/agent/accounting/vat-rates')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(vat.body.items).toHaveLength(2)

    const fy = await request(app)
      .get('/api/v1/agent/accounting/fiscal-years')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(fy.body.items[0].label).toBe('2026')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Entries + lines
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Accounting / entries', () => {
  it('lists entries with filters and returns lines on detail', async () => {
    const account = await ChartOfAccount.create({
      code: '411000',
      label: 'Clients',
      accountClass: 4,
      type: 'ACTIF',
      isActive: true,
    })
    const e1 = await AccountingEntry.create({
      journal: journalId,
      journalCode: 'VE',
      fiscalYear: fyId,
      entryNumber: 'VE-0001',
      date: new Date('2026-06-15'),
      label: 'Vente test',
      status: 'VALIDATED',
      totalDebit: 1200,
      totalCredit: 1200,
      createdBy: adminId,
    })
    const e2 = await AccountingEntry.create({
      journal: journalId,
      journalCode: 'VE',
      fiscalYear: fyId,
      entryNumber: 'VE-0002',
      date: new Date('2026-07-01'),
      label: 'Brouillon',
      status: 'DRAFT',
      totalDebit: 100,
      totalCredit: 100,
      createdBy: adminId,
    })
    await AccountingLine.create([
      {
        entry: e1._id,
        journalCode: 'VE',
        fiscalYear: fyId,
        date: e1.date,
        account: account._id,
        accountCode: '411000',
        accountLabel: 'Clients',
        debit: 1200,
        credit: 0,
        sortIndex: 0,
      },
      {
        entry: e1._id,
        journalCode: 'VE',
        fiscalYear: fyId,
        date: e1.date,
        account: account._id,
        accountCode: '707000',
        accountLabel: 'Ventes',
        debit: 0,
        credit: 1200,
        sortIndex: 1,
      },
    ])

    const { plainSecret } = await createAgentTokenInDb(['read:accounting'])

    // List
    const all = await request(app)
      .get('/api/v1/agent/accounting/entries')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(all.body.total).toBe(2)

    // Filter status
    const drafts = await request(app)
      .get('/api/v1/agent/accounting/entries?status=DRAFT')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(drafts.body.total).toBe(1)
    expect(drafts.body.items[0].entryNumber).toBe('VE-0002')

    // Filter journal by code
    const byJournal = await request(app)
      .get('/api/v1/agent/accounting/entries?journal=VE')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(byJournal.body.total).toBe(2)

    // Filter date range
    const inJune = await request(app)
      .get('/api/v1/agent/accounting/entries?from=2026-06-01&to=2026-06-30')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(inJune.body.total).toBe(1)
    expect(inJune.body.items[0].entryNumber).toBe('VE-0001')

    // Search by piece ref / label
    const search = await request(app)
      .get('/api/v1/agent/accounting/entries?q=Vente')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(search.body.total).toBe(1)

    // Detail with lines
    const detail = await request(app)
      .get(`/api/v1/agent/accounting/entries/${e1._id}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(detail.status).toBe(200)
    expect(detail.body.entry.entryNumber).toBe('VE-0001')
    expect(detail.body.lines).toHaveLength(2)
    expect(detail.body.lines[0].accountCode).toBe('411000')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// VAT declarations + external sources
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Accounting / TVA + sources externes', () => {
  it('lists VAT declarations + detail', async () => {
    const d = await VatDeclaration.create({
      fiscalYear: fyId,
      type: 'CA3',
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
      status: 'DRAFT',
      totalCollected: 100,
      totalDeductible: 30,
      totalDue: 70,
    })
    const { plainSecret } = await createAgentTokenInDb(['read:accounting'])

    const list = await request(app)
      .get('/api/v1/agent/accounting/vat-declarations')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.body.total).toBe(1)

    const detail = await request(app)
      .get(`/api/v1/agent/accounting/vat-declarations/${d._id}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(detail.body.type).toBe('CA3')
    expect(detail.body.totalDue).toBe(70)
  })

  it('lists external sources WITHOUT api key hash or webhook secret', async () => {
    const src = await ExternalSource.create({
      slug: 'test-source',
      name: 'Test',
      apiKeyHash: '$2b$10$abcd', // secret en base
      webhookSecret: 'topsecret-webhook',
      status: 'ACTIVE',
    })
    await ExternalTransaction.create({
      source: src._id,
      sourceSlug: 'test-source',
      idempotencyKey: 'tx-1',
      status: 'POSTED',
      rawPayload: { amount: 100 },
    })

    const { plainSecret } = await createAgentTokenInDb(['read:accounting'])

    const sources = await request(app)
      .get('/api/v1/agent/accounting/external-sources')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(sources.body.items[0].slug).toBe('test-source')
    expect(sources.body.items[0].apiKeyHash).toBeUndefined()
    expect(sources.body.items[0].webhookSecret).toBeUndefined()

    const tx = await request(app)
      .get('/api/v1/agent/accounting/external-transactions?sourceSlug=test-source')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(tx.body.total).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Dashboard
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Accounting / dashboard', () => {
  it('returns counts grouped by status and last-30-day totals', async () => {
    await AccountingEntry.create([
      {
        journal: journalId,
        journalCode: 'VE',
        fiscalYear: fyId,
        entryNumber: 'VE-A',
        date: new Date(),
        status: 'DRAFT',
        totalDebit: 100,
        totalCredit: 100,
      },
      {
        journal: journalId,
        journalCode: 'VE',
        fiscalYear: fyId,
        entryNumber: 'VE-B',
        date: new Date(),
        status: 'VALIDATED',
        totalDebit: 200,
        totalCredit: 200,
      },
      {
        journal: journalId,
        journalCode: 'VE',
        fiscalYear: fyId,
        entryNumber: 'VE-C',
        date: new Date(),
        status: 'VALIDATED',
        totalDebit: 300,
        totalCredit: 300,
      },
    ])

    const { plainSecret } = await createAgentTokenInDb(['read:accounting'])
    const res = await request(app)
      .get('/api/v1/agent/accounting/dashboard')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.fiscalYear?.label).toBe('2026')
    expect(res.body.entries.byStatus.DRAFT).toBe(1)
    expect(res.body.entries.byStatus.VALIDATED).toBe(2)
    expect(res.body.entries.byStatus.LOCKED).toBe(0)
    expect(res.body.entries.total).toBe(3)
    expect(res.body.periods.last30Days.entries).toBe(3)
    expect(res.body.periods.last30Days.totalDebit).toBe(600)
  })
})
