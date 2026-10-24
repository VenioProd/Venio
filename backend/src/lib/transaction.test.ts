import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDb, setupMongo, setupMongoReplSet, teardownMongo } from '../__tests__/helpers/mongoTestEnv.js'
import { resetTransactionSupportCache, runInTransaction } from './transaction.js'

const Probe =
  mongoose.models.TransactionProbe ?? mongoose.model('TransactionProbe', new mongoose.Schema({ label: String }))

describe('runInTransaction sur replica set', () => {
  beforeAll(async () => {
    await setupMongoReplSet()
    resetTransactionSupportCache()
    await Probe.init()
  })
  afterAll(teardownMongo)
  beforeEach(clearDb)

  it('valide toutes les écritures ensemble', async () => {
    await runInTransaction(async (session) => {
      await Probe.create([{ label: 'a' }, { label: 'b' }], { session, ordered: true })
    })
    expect(await Probe.countDocuments()).toBe(2)
  })

  it('n’écrit rien si une étape échoue', async () => {
    await expect(
      runInTransaction(async (session) => {
        await Probe.create([{ label: 'a' }], { session })
        throw new Error('échec au milieu')
      }),
    ).rejects.toThrow('échec au milieu')
    expect(await Probe.countDocuments()).toBe(0)
  })
})

describe('runInTransaction sur mongod autonome', () => {
  beforeAll(async () => {
    await setupMongo()
    resetTransactionSupportCache()
  })
  afterAll(teardownMongo)

  it('refuse avant d’écrire, avec un message explicite', async () => {
    await expect(
      runInTransaction(async (session) => {
        await Probe.create([{ label: 'a' }], { session })
      }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/replica set/) })
    expect(await Probe.countDocuments()).toBe(0)
  })
})
