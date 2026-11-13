/**
 * Archive les tâches personnelles ("Mon espace") devenues obsolètes.
 * Réversible : pose isArchived=true, rien n'est supprimé.
 *
 * Usage (depuis backend/) :
 *   npx tsx scripts/archive-personal-tasks.ts            # dry-run
 *   npx tsx scripts/archive-personal-tasks.ts --apply    # archive pour de bon
 *   npx tsx scripts/archive-personal-tasks.ts --apply --done-only   # seulement les TERMINE
 *
 * Pour annuler : db.personaltasks.updateMany({ isArchived: true }, { $set: { isArchived: false } })
 * Le script lit MONGODB_URI depuis le .env du backend.
 */

import 'dotenv/config'
import mongoose from 'mongoose'

import PersonalTask from '../src/models/PersonalTask.js'

const APPLY = process.argv.includes('--apply')
const DONE_ONLY = process.argv.includes('--done-only')
const MONGO_URI = process.env.MONGODB_URI

async function main() {
  if (!MONGO_URI) throw new Error('MONGODB_URI manquant')
  await mongoose.connect(MONGO_URI)

  const filter: Record<string, unknown> = { isArchived: false }
  if (DONE_ONLY) filter.status = 'TERMINE'

  const byStatus = await PersonalTask.aggregate([{ $match: filter }, { $group: { _id: '$status', n: { $sum: 1 } } }])
  const total = byStatus.reduce((s, r) => s + r.n, 0)
  console.log(`${total} tâche(s) personnelle(s) à archiver`, byStatus)

  if (APPLY) {
    const res = await PersonalTask.updateMany(filter, { $set: { isArchived: true } })
    console.log(`Archivées : ${res.modifiedCount}`)
  } else {
    console.log('Dry-run : relancer avec --apply pour archiver.')
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
