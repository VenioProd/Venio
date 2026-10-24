/**
 * Migration ponctuelle : les ProjectUpdate créés avant la synchro de l'app
 * native n'ont pas d'`updatedAt`. Sans lui, la synchro delta ne les verrait
 * jamais. On reprend leur date de création.
 *
 * Idempotent : ne touche que les documents sans `updatedAt`. À lancer avant la
 * mise en service de l'app.
 *
 * Usage :
 *   npm run migrate:project-update-timestamps
 *   npm run migrate:project-update-timestamps:dry
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import ProjectUpdate from '../models/ProjectUpdate.js'

dotenv.config()

const DRY_RUN = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI manquant')
    process.exit(1)
  }
  await mongoose.connect(uri)
  console.log(`Mode : ${DRY_RUN ? 'DRY RUN (aucune écriture)' : 'EXÉCUTION'}`)

  const missing = { updatedAt: { $exists: false } }
  const count = await ProjectUpdate.countDocuments(missing)
  console.log(`Mises à jour de projet sans updatedAt : ${count}`)
  if (!DRY_RUN && count > 0) {
    const result = await ProjectUpdate.collection.updateMany(missing, [
      { $set: { updatedAt: { $ifNull: ['$createdAt', '$$NOW'] } } },
    ])
    console.log(`Documents repris : ${result.modifiedCount}`)
  }

  await mongoose.disconnect()
}

main().catch((err: unknown) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
