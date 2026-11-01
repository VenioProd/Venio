import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { pathToFileURL } from 'node:url'
import ArrowPilotage from '../models/ArrowPilotage.js'
import Subsidiary from '../models/Subsidiary.js'

const keys = ['goals', 'scorecard', 'decisions', 'cadence'] as const

/** Copy only into a completely empty dossier. The conditional update also protects concurrent edits. */
export async function migrateArrowPilotageToSubsidiary(dryRun = false) {
  const source = await ArrowPilotage.findOne({ key: /^arrow$/i }).lean()
  if (!source) return { status: 'source-missing', modified: 0 }
  const target = await Subsidiary.findOne({ $or: [{ slug: /^arrow$/i }, { name: /^arrow$/i }] }).lean()
  if (!target) return { status: 'subsidiary-missing', modified: 0 }
  if (keys.some((key) => target.pilotage?.[key]?.length)) return { status: 'already-populated', modified: 0 }
  const pilotage = Object.fromEntries(keys.map((key) => [key, source[key] || []]))
  if (!keys.some((key) => source[key]?.length)) return { status: 'source-empty', modified: 0 }
  if (dryRun) return { status: 'would-migrate', modified: 0 }
  const result = await Subsidiary.updateOne(
    {
      _id: target._id,
      $and: keys.map((key) => ({
        $or: [{ [`pilotage.${key}`]: { $exists: false } }, { [`pilotage.${key}`]: { $size: 0 } }],
      })),
    },
    { $set: { pilotage } },
    { runValidators: true },
  )
  return { status: result.modifiedCount ? 'migrated' : 'already-populated', modified: result.modifiedCount }
}

async function main() {
  dotenv.config()
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI manquant')
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log(await migrateArrowPilotageToSubsidiary(process.argv.includes('--dry-run')))
  } finally {
    await mongoose.disconnect()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
