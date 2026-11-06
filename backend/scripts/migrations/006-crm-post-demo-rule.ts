/**
 * Migration one-shot : insère la règle prédéfinie « relance-post-demo » (et
 * toute autre règle prédéfinie absente), en brouillon.
 *
 * Contexte (chantier 2C, unification des automatisations) : chaque relance a
 * désormais une seule source. Quand la règle prédéfinie équivalente est ACTIVE,
 * le planificateur CRM et les jobs `crm.*` s'abstiennent. La relance après
 * une démo n'avait pas encore de règle équivalente au job
 * `crm.post_demo_followup` : elle est ajoutée au catalogue.
 *
 * Les règles prédéfinies ne sont insérées qu'une fois (`$setOnInsert`), en
 * DRAFT : rien ne change tant qu'un humain ne les active pas. Les règles déjà
 * en base (éventuellement modifiées à la main) ne sont pas touchées.
 *
 * Idempotente : une seconde exécution n'insère rien.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/006-crm-post-demo-rule.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
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
  logger.info({ created: await seedCrmRules() }, 'seed rules (post-demo)')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /006-crm-post-demo-rule/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
