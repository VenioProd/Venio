import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

beforeAll(async () => {
  await setupMongo()
  // Mongoose crée la collection dès que le modèle est compilé : on repart d'une base sans elle.
  const { default: CrmGoal } = await import('../models/CrmGoal.js')
  await CrmGoal.init()
  await CrmGoal.collection.drop().catch(() => undefined)
})
afterAll(teardownMongo)

describe('migration 009-crm-revenue', () => {
  it('--dry-run ne crée rien', async () => {
    const { migrateCrmRevenue } = await import('../lib/crmGoalsMigration.js')
    const result = await migrateCrmRevenue(true)
    expect(result).toMatchObject({ dryRun: true, collectionExisted: false, indexesBefore: [] })
    const collections = await mongoose.connection.db!.listCollections({ name: 'crmgoals' }).toArray()
    expect(collections).toHaveLength(0)
  })

  it('crée la collection et l’index unique, puis se rejoue sans rien changer', async () => {
    const { migrateCrmRevenue } = await import('../lib/crmGoalsMigration.js')
    const first = await migrateCrmRevenue(false)
    expect(first.collectionExisted).toBe(false)
    expect(first.indexesAfter).toContain('period_1_entity_1_userId_1')

    const second = await migrateCrmRevenue(false)
    expect(second.collectionExisted).toBe(true)
    expect(second.indexesAfter).toEqual(first.indexesAfter)

    const dry = await migrateCrmRevenue(true)
    expect(dry.indexesBefore).toEqual(first.indexesAfter)
  })
})
