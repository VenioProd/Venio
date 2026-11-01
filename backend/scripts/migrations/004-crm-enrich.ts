/**
 * Migration one-shot : enrichissement du CRM.
 *  - `probability` des leads existants, selon l'étape ;
 *  - `lastInteractionAt` / `interactionsCount` depuis le journal des échanges ;
 *  - règles prédéfinies (brouillons : rien ne se déclenche avant activation).
 * Idempotente. Les 6 jobs `crm*` historiques restent actifs : n'activez une règle
 * équivalente qu'après avoir désactivé son job (Système → Automatisations).
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/004-crm-enrich.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Lead, { STATUS_PROBABILITY } from '../../src/models/Lead.js'
import Interaction from '../../src/models/Interaction.js'
import { seedCrmRules } from '../../src/lib/crmRules.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri)

  for (const [status, probability] of Object.entries(STATUS_PROBABILITY)) {
    const res = await Lead.updateMany({ status, probability: { $exists: false } }, { $set: { probability } })
    logger.info({ status, modified: res.modifiedCount }, 'probability backfill')
  }

  const stats = await Interaction.aggregate([
    { $match: { subjectType: 'LEAD' } },
    { $group: { _id: '$subjectId', last: { $max: '$occurredAt' }, count: { $sum: 1 } } },
  ])
  for (const s of stats) {
    await Lead.updateOne({ _id: s._id }, { $set: { lastInteractionAt: s.last, interactionsCount: s.count } })
  }
  logger.info({ leads: stats.length }, 'interaction counters backfill')

  logger.info({ created: await seedCrmRules() }, 'seed rules')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed')
  process.exit(1)
})
