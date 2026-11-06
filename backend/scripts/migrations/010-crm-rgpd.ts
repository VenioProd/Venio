/**
 * Migration one-shot : minimum RGPD du CRM (chantier 3D).
 *
 * Pose sur les leads existants, sans rien écraser :
 *  - `consent` absent → { status: 'UNKNOWN', basis: 'LEGITIMATE_INTEREST', source: 'MIGRATION_010', at: null } ;
 *  - `consent.basis` absent ou vide → 'LEGITIMATE_INTEREST' (base par défaut de l'existant) ;
 *  - `consent.status` absent ou vide → 'UNKNOWN' ;
 *  - `doNotContact` absent → false (avec `doNotContactAt: null`, `doNotContactReason: ''`).
 * Crée l'index unique de la liste de suppression (`suppressionentries.emailNormalized`).
 *
 * Idempotente : une valeur déjà posée n'est jamais modifiée ; une seconde
 * exécution ne modifie rien. `updatedAt` n'est pas touché (la purge de
 * conservation s'y fie). La purge elle-même reste désactivée
 * (`retentionPurgeEnabled: false` par défaut) : cette migration n'anonymise rien.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/010-crm-rgpd.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { backfillLeadPrivacy } from '../../src/lib/crmPrivacy.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await backfillLeadPrivacy(process.argv.includes('--dry-run'))
  logger.info(result, 'crm rgpd backfill')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /010-crm-rgpd/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
