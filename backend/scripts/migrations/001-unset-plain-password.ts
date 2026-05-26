/**
 * Migration one-shot : retire le champ `plainPassword` de tous les `User`.
 * Originellement câblée au boot dans `backend/src/index.ts` — sortie ici pour
 * ne plus s'exécuter à chaque démarrage. Idempotente.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/001-unset-plain-password.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../../src/models/User.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri)
  logger.info('Connected to Mongo, running migration')

  const res = await User.updateMany(
    { plainPassword: { $exists: true } },
    { $unset: { plainPassword: '' } },
  )
  logger.info({ modified: res.modifiedCount }, 'Removed plainPassword field')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed')
  process.exit(1)
})
