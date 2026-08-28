/**
 * Migration : reprend les notes existantes dans le journal des échanges.
 *
 * - chaque `ClientNote` devient une `Interaction(NOTE, CLIENT)`
 * - chaque `LeadActivity` de type `NOTE` devient une `Interaction(NOTE, LEAD)`
 *
 * Idempotente : `migratedFrom` porte l'identifiant du document d'origine et
 * l'index unique partiel du modèle interdit un second passage. Rejouable donc
 * sans risque de doublon.
 *
 * Les documents sources ne sont PAS supprimés : la migration doit pouvoir être
 * vérifiée avant qu'on efface quoi que ce soit. Une fois la reprise validée en
 * production, la collection `clientnotes` pourra être retirée dans un second
 * temps.
 *
 * Usage :
 *   cd backend
 *   MONGODB_URI=... npx tsx scripts/migrations/003-notes-to-interactions.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import ClientNote from '../../src/models/ClientNote.js'
import LeadActivity from '../../src/models/LeadActivity.js'
import Interaction from '../../src/models/Interaction.js'
import logger from '../../src/lib/logger.js'

dotenv.config()

interface Outcome {
  created: number
  skipped: number
}

/** Vrai si l'erreur est une violation de l'index unique `migratedFrom`. */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000
}

async function migrateClientNotes(): Promise<Outcome> {
  const outcome: Outcome = { created: 0, skipped: 0 }
  const notes = await ClientNote.find({}).lean()

  for (const note of notes) {
    const migratedFrom = `ClientNote:${note._id}`
    try {
      await Interaction.create({
        subjectType: 'CLIENT',
        subjectId: note.clientId,
        kind: 'NOTE',
        direction: 'NONE',
        occurredAt: note.createdAt,
        body: note.content || '',
        pinned: Boolean(note.pinned),
        author: note.createdBy ?? null,
        migratedFrom,
        // On conserve la date d'origine : la timeline doit montrer la note là
        // où elle a réellement été écrite, pas au jour de la migration.
        createdAt: note.createdAt,
      })
      outcome.created += 1
    } catch (err) {
      if (!isDuplicate(err)) throw err
      outcome.skipped += 1
    }
  }

  return outcome
}

async function migrateLeadNotes(): Promise<Outcome> {
  const outcome: Outcome = { created: 0, skipped: 0 }
  const activities = await LeadActivity.find({ type: 'NOTE' }).lean()

  for (const activity of activities) {
    const migratedFrom = `LeadActivity:${activity._id}`
    try {
      await Interaction.create({
        subjectType: 'LEAD',
        subjectId: activity.leadId,
        kind: 'NOTE',
        direction: 'NONE',
        occurredAt: activity.createdAt,
        body: activity.label || '',
        author: activity.actorId ?? null,
        migratedFrom,
        createdAt: activity.createdAt,
      })
      outcome.created += 1
    } catch (err) {
      if (!isDuplicate(err)) throw err
      outcome.skipped += 1
    }
  }

  return outcome
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logger.error('MONGODB_URI is required')
    process.exit(1)
  }
  await mongoose.connect(uri)
  // L'index unique doit exister avant le premier insert, sinon l'idempotence
  // ne tient pas au premier passage.
  await Interaction.init()
  logger.info('Connected to Mongo, running migration')

  const clients = await migrateClientNotes()
  logger.info(clients, 'ClientNote → Interaction')

  const leads = await migrateLeadNotes()
  logger.info(leads, 'LeadActivity(NOTE) → Interaction')

  logger.info(
    { created: clients.created + leads.created, skipped: clients.skipped + leads.skipped },
    'Migration terminée — les documents sources sont conservés',
  )

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  logger.error({ err }, 'Migration failed')
  process.exit(1)
})
