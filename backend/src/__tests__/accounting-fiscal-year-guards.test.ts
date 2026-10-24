import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { clearDb, setupMongoReplSet, teardownMongo } from './helpers/mongoTestEnv.js'
import { createEntry, ensureFiscalYearFor } from '../lib/accounting/doubleEntry.js'
import { resetTransactionSupportCache } from '../lib/transaction.js'
import { createSession } from '../lib/session.js'
import fiscalYearRoutes from '../routes/admin/accounting/fiscalYears.js'
import FiscalYear from '../models/FiscalYear.js'
import AccountingEntry from '../models/AccountingEntry.js'
import AccountingLine from '../models/AccountingLine.js'
import Journal from '../models/Journal.js'
import ChartOfAccount from '../models/ChartOfAccount.js'
import Sequence from '../models/Sequence.js'
import User from '../models/User.js'

const app = express()
app.use(express.json())
app.use('/fiscal-years', fiscalYearRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})
let cookie: string
const entryInput = (date = '2026-06-01') => ({
  journal: 'BQ',
  date,
  status: 'VALIDATED' as const,
  lines: [
    { account: '512000', debit: 120 },
    { account: '706000', credit: 120 },
  ],
})
const close = (id: unknown) => request(app).post(`/fiscal-years/${id}/close`).set('Cookie', cookie)

beforeAll(async () => {
  await setupMongoReplSet()
  resetTransactionSupportCache()
  await Promise.all(
    [FiscalYear, AccountingEntry, AccountingLine, Journal, ChartOfAccount, Sequence, User].map((model) => model.init()),
  )
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.restoreAllMocks()
  await clearDb()
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@example.test',
    passwordHash: 'unused',
    role: 'SUPER_ADMIN',
  })
  cookie = `venio_session=${(await createSession(String(admin._id))).token}`
  await Journal.create([
    { code: 'BQ', label: 'Banque', type: 'BANQUE' },
    { code: 'AN', label: 'À nouveaux', type: 'AN' },
  ])
  await ChartOfAccount.create([
    { code: '512000', label: 'Banque', accountClass: 5, type: 'ACTIF' },
    { code: '706000', label: 'Prestations', accountClass: 7, type: 'PRODUIT' },
    { code: '120000', label: 'Bénéfice', accountClass: 1, type: 'PASSIF' },
    { code: '129000', label: 'Perte', accountClass: 1, type: 'PASSIF' },
  ])
})

it('refuse la dernière seconde non couverte sans modifier l’exercice clôturé', async () => {
  const fiscal = await FiscalYear.create({
    code: 'FY-2026',
    label: 'Exercice historique',
    status: 'CLOTURE',
    startDate: '2026-01-01',
    endDate: '2026-12-31T23:59:59.000Z',
  })
  const before = fiscal.toObject()
  await expect(createEntry(entryInput('2026-12-31T23:59:59.500Z'))).rejects.toMatchObject({ status: 409 })
  expect((await FiscalYear.findById(fiscal._id))!.toObject()).toEqual(before)
  expect(await AccountingEntry.countDocuments()).toBe(0)
  const auto = await ensureFiscalYearFor('2028-12-31T23:59:59.999Z')
  expect(auto.endDate.toISOString()).toBe('2028-12-31T23:59:59.999Z')
  await expect(createEntry(entryInput('2028-12-31T23:59:59.999Z'))).resolves.toBeDefined()
})

it('refuse sans session une écriture si l’exercice est clôturé après sa lecture', async () => {
  const fiscal = await ensureFiscalYearFor('2026-06-01')
  const find = FiscalYear.find
  vi.spyOn(FiscalYear, 'find').mockImplementationOnce(function (...args) {
    return find.apply(FiscalYear, args).post(async () => {
      await FiscalYear.updateOne({ _id: fiscal._id }, { status: 'CLOTURE' })
    })
  })
  await expect(createEntry(entryInput())).rejects.toMatchObject({ status: 423 })
  expect((await FiscalYear.findById(fiscal._id))!.status).toBe('CLOTURE')
  expect(await AccountingEntry.countDocuments()).toBe(0)
  expect(await AccountingLine.countDocuments()).toBe(0)
  expect(await Sequence.countDocuments()).toBe(0)
})

it('préserve les écritures étrangères lorsque le journal AN manque', async () => {
  const { entry } = await createEntry(entryInput())
  const foreign = await createEntry(entryInput('2027-02-01'))
  const fiscalBefore = (await FiscalYear.findById(entry.fiscalYear))!.toObject()
  const foreignBefore = foreign.entry.toObject()
  const linesBefore = await AccountingLine.find({ entry: foreign.entry._id }).sort({ sortIndex: 1 }).lean()
  await Journal.deleteOne({ code: 'AN' })
  await close(entry.fiscalYear).expect(400)
  expect((await FiscalYear.findById(entry.fiscalYear))!.toObject()).toEqual(fiscalBefore)
  expect((await AccountingEntry.findById(foreign.entry._id))!.toObject()).toEqual(foreignBefore)
  expect(await AccountingLine.find({ entry: foreign.entry._id }).sort({ sortIndex: 1 }).lean()).toEqual(linesBefore)
  expect((await AccountingEntry.findById(entry._id))!.status).toBe('VALIDATED')
  expect(await AccountingEntry.countDocuments({ source: 'AN' })).toBe(0)
  expect(await AccountingEntry.countDocuments()).toBe(2)
  expect(await AccountingLine.countDocuments()).toBe(4)
})

it('annule aussi les à-nouveaux et le verrouillage si la sauvegarde finale échoue', async () => {
  const { entry } = await createEntry(entryInput())
  const fiscalBefore = (await FiscalYear.findById(entry.fiscalYear))!.toObject()
  const save = FiscalYear.prototype.save
  vi.spyOn(FiscalYear.prototype, 'save').mockImplementation(async function (
    this: InstanceType<typeof FiscalYear>,
    ...args
  ) {
    if (this.status === 'CLOTURE') throw new Error('Sauvegarde refusée')
    return save.apply(this, args)
  })
  await close(entry.fiscalYear).expect(500)
  expect((await FiscalYear.findById(entry.fiscalYear))!.toObject()).toEqual(fiscalBefore)
  expect((await AccountingEntry.findById(entry._id))!.status).toBe('VALIDATED')
  expect(await FiscalYear.countDocuments()).toBe(1)
  expect(await AccountingEntry.countDocuments()).toBe(1)
  expect(await AccountingLine.countDocuments()).toBe(2)
  expect(await Sequence.countDocuments({ name: 'accounting:AN:2027' })).toBe(0)
})

it('clôture et reporte les soldes avec le résultat sans permettre une seconde clôture', async () => {
  const { entry } = await createEntry(entryInput())
  const response = await close(entry.fiscalYear).expect(200)
  expect(response.body.closedFiscalYear.status).toBe('CLOTURE')
  expect(response.body.closedFiscalYear.openingEntryId).toBe(response.body.openingEntry._id)
  expect(response.body.nextFiscalYear.endDate).toBe('2027-12-31T23:59:59.999Z')
  expect(response.body.balanceTransferred).toEqual({ accountsCount: 1, totalDebit: 120, totalCredit: 120, result: 120 })
  expect((await AccountingEntry.findById(entry._id))!.status).toBe('LOCKED')
  const opening = (await AccountingEntry.findById(response.body.openingEntry._id))!
  expect(opening.status).toBe('VALIDATED')
  expect(String(opening.fiscalYear)).toBe(response.body.nextFiscalYear._id)
  const lines = await AccountingLine.find({ entry: opening._id }).sort({ accountCode: 1 }).lean()
  expect(lines.map(({ accountCode, debit, credit, lettrage }) => ({ accountCode, debit, credit, lettrage }))).toEqual([
    { accountCode: '120000', debit: 0, credit: 120, lettrage: 'AN' },
    { accountCode: '512000', debit: 120, credit: 0, lettrage: 'AN' },
  ])
  await close(entry.fiscalYear).expect(400)
  await expect(createEntry(entryInput())).rejects.toMatchObject({ status: 423 })
  expect(await AccountingEntry.countDocuments({ source: 'AN' })).toBe(1)
})

it('refuse un exercice calendaire qui empiéterait sur un exercice défini à la main, et une date ambiguë', async () => {
  await FiscalYear.create({
    code: 'FY-2026-S',
    label: 'Exercice décalé',
    status: 'CLOTURE',
    startDate: '2026-04-01',
    endDate: '2026-09-30T23:59:59.999Z',
  })
  await expect(createEntry(entryInput('2026-12-01'))).rejects.toMatchObject({ status: 409 })
  await expect(createEntry(entryInput('2026-08-01'))).rejects.toMatchObject({ status: 423 })
  expect(await FiscalYear.countDocuments()).toBe(1)
  await FiscalYear.create({
    code: 'FY-2027-A',
    label: 'A',
    startDate: '2027-01-01',
    endDate: '2027-12-31T23:59:59.999Z',
  })
  await FiscalYear.create({
    code: 'FY-2027-B',
    label: 'B',
    startDate: '2027-06-01',
    endDate: '2028-05-31T23:59:59.999Z',
  })
  await expect(createEntry(entryInput('2027-07-01'))).rejects.toMatchObject({ status: 409 })
  expect(await AccountingEntry.countDocuments()).toBe(0)
})

it('refuse une clôture dont l’exercice suivant serait l’exercice clôturé lui-même', async () => {
  const fiscal = await FiscalYear.create({
    code: 'FY-2026',
    label: 'Premier semestre',
    startDate: '2026-01-01',
    endDate: '2026-06-30T23:59:59.999Z',
  })
  await createEntry(entryInput('2026-03-01'))
  await close(fiscal._id).expect(400)
  expect((await FiscalYear.findById(fiscal._id))!.status).toBe('OUVERT')
  expect(await AccountingEntry.countDocuments({ source: 'AN' })).toBe(0)
  expect(await AccountingEntry.countDocuments({ status: 'LOCKED' })).toBe(0)
})
