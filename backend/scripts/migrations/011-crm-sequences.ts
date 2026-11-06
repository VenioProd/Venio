/**
 * Migration one-shot : séquences d'e-mails du CRM (lot 5).
 *
 * Crée les index des collections `crmsequences` et `crmsequenceenrollments` :
 *  - file du moteur `{ status, nextRunAt }` ;
 *  - unicité d'une inscription ouverte par séquence et lead (`openKey`, index partiel) ;
 *  - lecture par lead et par séquence.
 * Ne modifie aucun document. Idempotente ; `--dry-run` se contente de compter.
 * Logique : `ensureSequenceIndexes` (src/lib/crmSequences.ts).
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/011-crm-sequences.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ensureSequenceIndexes } from '../../src/lib/crmSequences.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await ensureSequenceIndexes(process.argv.includes('--dry-run'))
  logger.info(result, 'crm sequences indexes')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /011-crm-sequences/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
