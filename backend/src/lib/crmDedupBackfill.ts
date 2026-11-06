import Lead from '../models/Lead.js'
import { normalizeCompanyName, normalizeEmail, normalizePhone } from './crmDedup.js'

/**
 * Remplit `contactEmailNormalized`, `contactPhoneNormalized` et `companyNormalized`
 * sur les leads existants et crée les trois index de détection de doublons.
 *
 * Idempotente : la valeur attendue est recalculée depuis les champs saisis, et
 * seuls les leads dont une valeur normalisée est absente ou différente sont
 * écrits. `updatedAt` n'est pas modifié (le rattrapage ne doit pas faire
 * remonter tous les leads en tête des listes).
 *
 * `dryRun` : compte sans écrire (ni données, ni index).
 */
export async function backfillLeadDedupFields(
  dryRun = false,
  batchSize = 500,
): Promise<{ scanned: number; updated: number; dryRun: boolean }> {
  if (!dryRun) {
    // Index créés explicitement : la production ne dépend pas de l'autoIndex.
    await Lead.collection.createIndex({ contactEmailNormalized: 1 })
    await Lead.collection.createIndex({ contactPhoneNormalized: 1 })
    await Lead.collection.createIndex({ companyNormalized: 1 })
  }

  let scanned = 0
  let updated = 0
  let ops: Array<{ updateOne: { filter: { _id: unknown }; update: { $set: Record<string, string> } } }> = []

  const flush = async () => {
    if (ops.length === 0) return
    const res = await Lead.bulkWrite(ops as never, { timestamps: false, ordered: false })
    updated += res.modifiedCount
    ops = []
  }

  const cursor = Lead.find({})
    .select('company contactEmail contactPhone contactEmailNormalized contactPhoneNormalized companyNormalized')
    .lean()
    .cursor()
  for await (const lead of cursor) {
    scanned += 1
    const expected = {
      contactEmailNormalized: normalizeEmail(lead.contactEmail),
      contactPhoneNormalized: normalizePhone(lead.contactPhone),
      companyNormalized: normalizeCompanyName(lead.company),
    }
    const stale = (Object.keys(expected) as Array<keyof typeof expected>).some((k) => lead[k] !== expected[k])
    if (!stale) continue
    if (dryRun) {
      updated += 1
      continue
    }
    ops.push({ updateOne: { filter: { _id: lead._id }, update: { $set: expected } } })
    if (ops.length >= batchSize) await flush()
  }
  await flush()
  return { scanned, updated, dryRun }
}
