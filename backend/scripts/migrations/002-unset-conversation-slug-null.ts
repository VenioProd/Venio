/**
 * Migration one-shot : retire `slug: null` sur les conversations DM/GROUP.
 * L'index sparse unique sur `slug` rejette les insertions multiples si
 * `slug === null`. Originellement câblée au boot dans `backend/src/index.ts`.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/002-unset-conversation-slug-null.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import InternalConversation from '../../src/models/InternalConversation.js'
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

  const res = await InternalConversation.updateMany(
    { type: { $in: ['DM', 'GROUP'] }, slug: null },
    { $unset: { slug: '' } },
  )
  logger.info({ modified: res.modifiedCount }, 'Unset slug:null on DM/GROUP conversations')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed')
  process.exit(1)
})
