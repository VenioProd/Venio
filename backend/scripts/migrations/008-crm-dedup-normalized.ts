/**
 * Migration one-shot : champs normalisés de détection de doublons (chantier 3B).
 *
 * Remplit `Lead.contactEmailNormalized` (trim + minuscules),
 * `Lead.contactPhoneNormalized` (chiffres, +33/0033 ramené à 0) et
 * `Lead.companyNormalized` (minuscules, sans accents ni ponctuation), et crée
 * leurs index. À exécuter avant ou avec le déploiement : tant que les leads
 * ne sont pas migrés, la détection ne les voit pas.
 *
 * Idempotente : seuls les leads dont une valeur normalisée est absente ou
 * périmée sont écrits ; une seconde exécution ne modifie rien. `updatedAt`
 * n'est pas touché. `--dry-run` compte sans écrire.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/008-crm-dedup-normalized.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { backfillLeadDedupFields } from '../../src/lib/crmDedupBackfill.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await backfillLeadDedupFields(process.argv.includes('--dry-run'))
  logger.info(result, 'lead dedup fields backfill')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /008-crm-dedup-normalized/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
