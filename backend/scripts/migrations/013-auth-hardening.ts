/**
 * Migration one-shot : durcissement de l'authentification (VENIO-116/117).
 *
 * Crée les index des collections `passwordresettokens` (jetons de
 * réinitialisation persistants : empreinte unique, index TTL sur `expiresAt`)
 * et `mfachallenges` (second temps de la connexion 2FA, TTL de 5 min).
 * Ne lit ni ne modifie aucun document existant ; les anciens jetons de
 * réinitialisation, gardés en mémoire, disparaissent au redémarrage.
 * Idempotente ; `--dry-run` se contente de compter.
 * Logique : `ensureAuthHardeningIndexes` (src/lib/auth/passwordReset.ts).
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/013-auth-hardening.ts [--dry-run]
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ensureAuthHardeningIndexes } from '../../src/lib/auth/passwordReset.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  const result = await ensureAuthHardeningIndexes(process.argv.includes('--dry-run'))
  logger.info(result, 'auth hardening indexes')
  await mongoose.disconnect()
  process.exit(0)
}

// Exécutée seulement en script, pas à l'import (tests).
if (process.argv[1] && /013-auth-hardening/.test(process.argv[1])) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed')
    process.exit(1)
  })
}
