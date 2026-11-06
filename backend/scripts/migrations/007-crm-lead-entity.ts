/**
 * Migration one-shot : entité du groupe sur les leads (chantier 3A).
 *
 * Pose `Lead.entity` sur les leads qui n'en ont pas, d'après leur projet :
 *  - ARROW → ARROW ;
 *  - VENIO, ARTOSERA (projet porté par Venio), VIGNO, AUTRE, vide → VENIO.
 * Crée l'index `{ entity: 1, status: 1 }`.
 *
 * Idempotente : une entité déjà posée n'est jamais écrasée ; une seconde
 * exécution ne modifie rien. `updatedAt` n'est pas touché.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/007-crm-lead-entity.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { backfillLeadEntities } from '../../src/lib/crmEntityBackfill.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await backfillLeadEntities(process.argv.includes('--dry-run'))
  logger.info(result, 'lead entity backfill')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /007-crm-lead-entity/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
