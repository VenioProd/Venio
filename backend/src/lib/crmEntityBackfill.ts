import Lead from '../models/Lead.js'
import { DEFAULT_GROUP_ENTITY } from './groupEntities.js'

/**
 * Pose `Lead.entity` sur les leads qui n'en ont pas, en la déduisant du
 * projet : ARROW → ARROW ; VENIO, ARTOSERA (projet porté par Venio), VIGNO,
 * AUTRE et projet vide → VENIO.
 *
 * Idempotente : seuls les leads sans entité (champ absent, `null` ou vide)
 * sont touchés ; une entité déjà posée, à la main ou par une exécution
 * précédente, n'est jamais écrasée. `updatedAt` n'est pas modifié : le
 * rattrapage ne doit pas faire remonter tous les leads en tête des listes.
 *
 * `dryRun` : compte sans écrire.
 */
export async function backfillLeadEntities(dryRun = false): Promise<{ arrow: number; venio: number; dryRun: boolean }> {
  const missing = { entity: { $in: [null, ''] } }
  const arrowFilter = { ...missing, project: 'ARROW' }
  const venioFilter = { ...missing, project: { $ne: 'ARROW' } }
  if (dryRun) {
    const [arrow, venio] = await Promise.all([Lead.countDocuments(arrowFilter), Lead.countDocuments(venioFilter)])
    return { arrow, venio, dryRun }
  }
  // L'index est créé explicitement : la production ne dépend pas de l'autoIndex.
  await Lead.collection.createIndex({ entity: 1, status: 1 })
  const arrow = await Lead.updateMany(arrowFilter, { $set: { entity: 'ARROW' } }, { timestamps: false, strict: false })
  const venio = await Lead.updateMany(
    venioFilter,
    { $set: { entity: DEFAULT_GROUP_ENTITY } },
    { timestamps: false, strict: false },
  )
  return { arrow: arrow.modifiedCount, venio: venio.modifiedCount, dryRun }
}
