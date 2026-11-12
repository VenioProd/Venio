/**
 * Migration one-shot : objectifs commerciaux (chantier 3C).
 *
 * Crée la collection `crmgoals` et son index unique {period, entity, userId}
 * (un objectif par mois et par périmètre). Aucune donnée existante n'est lue
 * ni modifiée : les objectifs se saisissent ensuite depuis l'analytique CRM.
 *
 * Idempotente : une seconde exécution ne change rien (`syncIndexes` ne retire
 * ni ne recrée un index déjà conforme). `--dry-run` liste ce qui serait fait.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/009-crm-revenue.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { migrateCrmRevenue } from '../../src/lib/crmGoalsMigration.js'
export { migrateCrmRevenue } from '../../src/lib/crmGoalsMigration.js'
export type { CrmRevenueMigrationResult } from '../../src/lib/crmGoalsMigration.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await migrateCrmRevenue(process.argv.includes('--dry-run'))
  logger.info(result, 'crm revenue migration')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /009-crm-revenue/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
