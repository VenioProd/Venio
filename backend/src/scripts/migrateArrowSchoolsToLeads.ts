import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import ArrowSchool from '../models/ArrowSchool.js'
import Lead from '../models/Lead.js'
import type { CrmStatus, LeadTemperature } from '../types/enums.js'

type School = mongoose.InferSchemaType<typeof ArrowSchool.schema> & { _id: mongoose.Types.ObjectId }

// Le pipeline Lead distingue la qualification du premier contact. Une réponse
// obtenue devient QUALIFIED ; les deux étapes de démo se rejoignent en DEMO.
// Le statut Arrow exact reste dans les notes, y compris pour les écoles archivées.
export const ARROW_STATUS_TO_LEAD = {
  A_PROSPECTER: 'LEAD', // Aucun contact engagé.
  CONTACTE: 'CONTACTED', // Premier contact effectué.
  REPONSE: 'QUALIFIED', // Réponse obtenue, avant la démo.
  DEMO_PLANIFIEE: 'DEMO', // Le CRM ne distingue pas une démo planifiée d'une démo faite.
  DEMO_FAITE: 'DEMO',
  PROPOSITION: 'PROPOSAL', // Offre envoyée.
  SIGNE: 'WON', // Établissement signé.
  NON_INTERESSE: 'LOST', // Refus du prospect.
} as const satisfies Record<School['status'], CrmStatus>

// Les deux modèles utilisent exactement les mêmes quatre niveaux.
export const ARROW_TEMPERATURE_TO_LEAD = {
  FROID: 'FROID',
  TIEDE: 'TIEDE',
  CHAUD: 'CHAUD',
  TRES_CHAUD: 'TRES_CHAUD',
} as const satisfies Record<School['temperature'], LeadTemperature>

export function mapArrowSchoolToLead(school: School) {
  const status = ARROW_STATUS_TO_LEAD[school.status]
  const leadTemperature = ARROW_TEMPERATURE_TO_LEAD[school.temperature]
  if (!status || !leadTemperature) throw new Error('Statut ou température Arrow inconnu')

  // Lead n'a pas de champs ville/région/rôle/type/effectif/archivage.
  // LeadActivity accepte un payload libre mais pas de tâche de relance avec
  // échéance et état « fait ». On conserve donc les relances dans les notes,
  // dans la même écriture atomique que le lead (aucune reprise partielle).
  const notes = [
    school.notes || '',
    `Provenance : arrow-school:${school._id}`,
    `Statut Arrow : ${school.status}`,
    `Archivée dans Arrow : ${school.isArchived ? 'oui' : 'non'}`,
    `Ville : ${school.city || ''}`,
    `Région : ${school.region || ''}`,
    `Type d'école : ${school.schoolType}`,
    `Effectif : ${school.studentCount ?? 'non renseigné'}`,
    `Rôle du contact : ${school.contactRole || ''}`,
    `Email général : ${school.emailGeneral || ''}`,
    ...school.relances.map(
      (relance, index) =>
        `Relance ${index + 1} | ${relance.date?.toISOString() ?? 'sans date'} | ${relance.done ? 'faite' : 'à faire'} | ${relance.note || ''}`,
    ),
  ]
    .filter(Boolean)
    .join('\n')

  return {
    legacyArrowSchoolId: school._id,
    project: 'ARROW' as const,
    company: school.name,
    contactName: school.contactName,
    contactEmail: school.contactEmail || school.emailGeneral,
    contactPhone: school.contactPhone,
    source: school.source,
    status,
    leadTemperature,
    notes,
    nextActionAt: school.nextActionAt,
    lastContactAt: school.lastContactAt,
    statusChangedAt: school.statusChangedAt,
    assignedTo: school.assignedTo,
    createdBy: school.createdBy,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
  }
}

export async function migrateArrowSchoolsToLeads({
  dryRun = false,
  log = console.log,
}: { dryRun?: boolean; log?: (message: string) => void } = {}) {
  const summary = { scanned: 0, created: 0, skipped: 0, wouldCreate: 0, failed: 0, relances: 0 }
  log(`Mode : ${dryRun ? 'DRY RUN (aucune écriture)' : 'EXÉCUTION'}`)
  if (!dryRun) {
    // Garantit l'idempotence même si deux exécutions se chevauchent, sans
    // dépendre de l'autoIndex de l'environnement de production.
    await Lead.collection.createIndex({ legacyArrowSchoolId: 1 }, { unique: true, sparse: true })
  }
  // Documents hydratés : les anciennes écoles bénéficient aussi des valeurs
  // par défaut du modèle lorsque des champs ont été ajoutés après leur création.
  for await (const school of ArrowSchool.find().sort({ _id: 1 }).cursor()) {
    summary.scanned++
    try {
      const filter = { legacyArrowSchoolId: school._id }
      if (await Lead.exists(filter)) {
        summary.skipped++
        continue
      }
      const lead = new Lead(mapArrowSchoolToLead(school))
      await lead.validate()
      if (dryRun) {
        summary.wouldCreate++
      } else {
        // $setOnInsert ne modifie jamais un lead déjà migré. Pas de save() :
        // pas de notifications d'assignation envoyées pour des données historiques.
        const result = await Lead.updateOne(
          filter,
          { $setOnInsert: lead.toObject() },
          {
            upsert: true,
            timestamps: false,
            setDefaultsOnInsert: false,
          },
        )
        if (!result.upsertedCount) {
          summary.skipped++
          continue
        }
        summary.created++
      }
      summary.relances += school.relances.length
    } catch (error) {
      // Un concurrent peut avoir inséré le même établissement entre exists et upsert.
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000 &&
        (await Lead.exists({ legacyArrowSchoolId: school._id }))
      ) {
        summary.skipped++
        continue
      }
      summary.failed++
      log(`Échec école ${school._id} : ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  log(
    `Résumé : ${summary.scanned} écoles lues ; ${summary.created} leads créés ; ${summary.wouldCreate} à créer ; ${summary.skipped} déjà migrées ; ${summary.failed} erreurs ; ${summary.relances} relances conservées${dryRun ? ' (simulation)' : ''}.`,
  )
  return summary
}

export async function main(): Promise<void> {
  dotenv.config()
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  // Le dry-run ne crée ni collection ni index par les mécanismes automatiques Mongoose.
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  try {
    const summary = await migrateArrowSchoolsToLeads({ dryRun: process.argv.includes('--dry-run') })
    if (summary.failed) process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error('Erreur fatale :', error)
    process.exitCode = 1
  })
}
