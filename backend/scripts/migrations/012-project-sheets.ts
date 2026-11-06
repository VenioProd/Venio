/**
 * Migration one-shot : fiches projets (réceptacle de connaissance par projet du groupe).
 *
 *  - crée la collection `projectsheets` et ses index (slug unique, filiale unique) ;
 *  - crée les fiches manquantes du brouillon fourni par Raphael (Venio, Creatio,
 *    Decisio, Formatio, Arrow, Virendys, Artosera), marquées « Brouillon à relire » ;
 *  - sur une fiche existante, ne remplit QUE les champs vides ;
 *  - crée une fiche vide « à compléter » pour chaque filiale du dossier
 *    SUPER_ADMIN qui n'en a pas (aucune donnée inventée ni recopiée) ;
 *  - ne crée AUCUN accès démo ni identifiant.
 * Idempotente ; `--dry-run` affiche le rapport sans rien écrire.
 * Logique : `seedProjectSheets` (src/lib/projectSheetSeed.ts).
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/012-project-sheets.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ensureProjectSheetIndexes, seedProjectSheets } from '../../src/lib/projectSheetSeed.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const dryRun = process.argv.includes('--dry-run')
  if (!dryRun) await ensureProjectSheetIndexes()
  const report = await seedProjectSheets({ dryRun })
  logger.info({ dryRun, ...report }, 'project sheets')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /012-project-sheets/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
