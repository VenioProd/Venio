/**
 * Logique de la migration 009 (objectifs commerciaux), placée sous src/ pour être testable
 * et compilée avec le backend. Le script scripts/migrations/009-crm-revenue.ts l'appelle.
 */
import mongoose from 'mongoose'
import CrmGoal from '../models/CrmGoal.js'

export interface CrmRevenueMigrationResult {
  dryRun: boolean
  collectionExisted: boolean
  indexesBefore: string[]
  indexesAfter: string[]
}

export async function migrateCrmRevenue(dryRun: boolean): Promise<CrmRevenueMigrationResult> {
  const name = CrmGoal.collection.collectionName
  const existing = await mongoose.connection.db!.listCollections({ name }).toArray()
  const collectionExisted = existing.length > 0
  const indexNames = async () => (collectionExisted ? (await CrmGoal.collection.indexes()).map((index) => String(index.name)) : [])
  const indexesBefore = await indexNames()

  if (dryRun) {
    return { dryRun, collectionExisted, indexesBefore, indexesAfter: indexesBefore }
  }

  if (!collectionExisted) await CrmGoal.createCollection()
  await CrmGoal.syncIndexes()
  const indexesAfter = (await CrmGoal.collection.indexes()).map((index) => String(index.name))
  return { dryRun, collectionExisted, indexesBefore, indexesAfter }
}
