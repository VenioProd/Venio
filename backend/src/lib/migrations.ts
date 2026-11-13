import User from '../models/User.js'
import InternalConversation from '../models/InternalConversation.js'
import ClientNote from '../models/ClientNote.js'
import LeadActivity from '../models/LeadActivity.js'
import Interaction from '../models/Interaction.js'
import Lead, { STATUS_PROBABILITY } from '../models/Lead.js'
import CrmRule from '../models/CrmRule.js'
import { seedCrmRules, SEED_RULES } from './crmRules.js'
import { backfillLeadEntities } from './crmEntityBackfill.js'
import { backfillLeadDedupFields } from './crmDedupBackfill.js'
import { migrateCrmRevenue } from './crmGoalsMigration.js'
import { backfillLeadPrivacy } from './crmPrivacy.js'
import { ensureSequenceIndexes } from './crmSequences.js'
import { ensureProjectSheetIndexes, seedProjectSheets } from './projectSheetSeed.js'
import { ensureAuthHardeningIndexes } from './auth/passwordReset.js'
import { ensurePhoneSuppressionIndexes } from './callGuards.js'
import { EXTERNAL_SALES_ROLE } from './externalSales.js'

interface Outcome {
  created: number
  skipped: number
}

/** Vrai si l'erreur est une violation de l'index unique `migratedFrom`. */
function isDuplicate(err: unknown): boolean {
  return (err as { code?: number })?.code === 11000
}

async function migrateClientNotes(dryRun: boolean): Promise<Outcome> {
  const outcome: Outcome = { created: 0, skipped: 0 }
  const notes = await ClientNote.find({}).lean()

  for (const note of notes) {
    const migratedFrom = `ClientNote:${note._id}`
    if (await Interaction.exists({ migratedFrom })) {
      outcome.skipped += 1
      continue
    }
    if (dryRun) {
      outcome.created += 1
      continue
    }
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

async function migrateLeadNotes(dryRun: boolean): Promise<Outcome> {
  const outcome: Outcome = { created: 0, skipped: 0 }
  const activities = await LeadActivity.find({ type: 'NOTE' }).lean()

  for (const activity of activities) {
    const migratedFrom = `LeadActivity:${activity._id}`
    if (await Interaction.exists({ migratedFrom })) {
      outcome.skipped += 1
      continue
    }
    if (dryRun) {
      outcome.created += 1
      continue
    }
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

export const FORM_RULE_KEY = 'nouveau-lead-formulaire'
export const FORM_SOURCE = 'FORMULAIRE_SITE'

/** Ajoute FORMULAIRE_SITE aux conditions « source in [...] » de la règle formulaire. Rend le nombre de règles modifiées. */
export async function addFormSourceToRule(dryRun = false): Promise<number> {
  // Collection native : la valeur d'une condition est un champ Mixed, que les
  // filtres de tableau de Mongoose ne savent pas typer.
  if (dryRun)
    return CrmRule.collection.countDocuments({
      systemKey: FORM_RULE_KEY,
      'conditions.items': {
        $elemMatch: { field: 'source', operator: 'in', value: { $type: 'array', $ne: FORM_SOURCE } },
      },
    })
  const res = await CrmRule.collection.updateMany(
    {
      systemKey: FORM_RULE_KEY,
      'conditions.items': {
        $elemMatch: { field: 'source', operator: 'in', value: { $type: 'array', $ne: FORM_SOURCE } },
      },
    },
    { $addToSet: { 'conditions.items.$[cond].value': FORM_SOURCE } },
    { arrayFilters: [{ 'cond.field': 'source', 'cond.operator': 'in', 'cond.value': { $type: 'array' } }] },
  )
  return res.modifiedCount
}

/**
 * Fiches saisies par un externe avant `enteredByRep` : créées par un compte
 * externe (lui ou un prédécesseur sur la fiche), toujours détenues par un
 * externe. Elles quittent les vues de l'équipe jusqu'au passage au closer.
 */
async function markRepEnteredLeads(dryRun: boolean) {
  const reps = await User.distinct('_id', { role: EXTERNAL_SALES_ROLE })
  const filter = { createdBy: { $in: reps }, externalRep: { $ne: null }, enteredByRep: { $ne: true } }
  return dryRun
    ? Lead.countDocuments(filter)
    : (await Lead.updateMany(filter, { $set: { enteredByRep: true } }, { timestamps: false })).modifiedCount
}

async function seedRules(dryRun: boolean) {
  if (!dryRun) return seedCrmRules()
  const keys = SEED_RULES.map((rule) => rule.systemKey)
  return keys.length - (await CrmRule.countDocuments({ systemKey: { $in: keys } }))
}

async function enrichLeads(dryRun: boolean) {
  let probabilities = 0
  for (const [status, probability] of Object.entries(STATUS_PROBABILITY)) {
    const filter = { status, probability: { $exists: false } }
    probabilities += dryRun
      ? await Lead.countDocuments(filter)
      : (await Lead.updateMany(filter, { $set: { probability } })).modifiedCount
  }
  const stats = await Interaction.aggregate([
    { $match: { subjectType: 'LEAD' } },
    { $group: { _id: '$subjectId', last: { $max: '$occurredAt' }, count: { $sum: 1 } } },
  ])
  if (!dryRun)
    for (const stat of stats) {
      await Lead.updateOne({ _id: stat._id }, { $set: { lastInteractionAt: stat.last, interactionsCount: stat.count } })
    }
  return { probabilities, counters: stats.length, rules: await seedRules(dryRun) }
}

export const migrations: Record<string, (dryRun: boolean) => Promise<unknown>> = {
  '001': async (dryRun) => {
    const filter = { plainPassword: { $exists: true } }
    return dryRun
      ? User.collection.countDocuments(filter)
      : User.collection.updateMany(filter, { $unset: { plainPassword: '' } })
  },
  '002': async (dryRun) => {
    const filter = { type: { $in: ['DM', 'GROUP'] }, slug: { $type: 10 } }
    return dryRun
      ? InternalConversation.collection.countDocuments(filter)
      : InternalConversation.collection.updateMany(filter, { $unset: { slug: '' } })
  },
  '003': async (dryRun) => {
    if (!dryRun) await Interaction.createIndexes()
    return { clients: await migrateClientNotes(dryRun), leads: await migrateLeadNotes(dryRun) }
  },
  '004': enrichLeads,
  '005': addFormSourceToRule,
  '006': seedRules,
  '007': backfillLeadEntities,
  '008': backfillLeadDedupFields,
  '009': migrateCrmRevenue,
  '010': backfillLeadPrivacy,
  '011': ensureSequenceIndexes,
  '012': async (dryRun) => {
    if (!dryRun) await ensureProjectSheetIndexes()
    return seedProjectSheets({ dryRun })
  },
  '013': ensureAuthHardeningIndexes,
  '014': ensurePhoneSuppressionIndexes,
  '015': markRepEnteredLeads,
}
