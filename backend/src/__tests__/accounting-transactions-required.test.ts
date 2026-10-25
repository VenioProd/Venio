import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import entriesRoutes from '../routes/admin/accounting/entries.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import Sequence from '../models/Sequence.js'
import FiscalYear from '../models/FiscalYear.js'

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: '000000000000000000000001', role: 'SUPER_ADMIN', name: 'Admin', email: 'admin@example.test' }
    next()
  },
}))

beforeAll(async () => {
  await setupMongo()
  resetTransactionSupportCache()
})
afterAll(teardownMongo)

it('refuse une écriture manuelle sans replica set avant toute écriture en base', async () => {
  const app = express()
  app.use(express.json())
  app.use('/entries', entriesRoutes)
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status || 500).json({ error: err.message })
  })
  const response = await request(app)
    .post('/entries')
    .send({
      journal: 'BQ',
      date: '2026-06-01',
      status: 'VALIDATED',
      lines: [
        { account: '512000', debit: 120 },
        { account: '706000', credit: 120 },
      ],
    })
    .expect(503)
  expect(response.body.error).toBe(
    'Transactions indisponibles : MongoDB doit tourner en replica set (mono-nœud suffit)',
  )
  for (const model of [AccountingEntry, AccountingLine, Sequence, FiscalYear]) {
    expect(await model.countDocuments()).toBe(0)
  }
})
