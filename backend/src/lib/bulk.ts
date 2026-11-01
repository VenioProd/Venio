import mongoose from 'mongoose'

/** Nombre maximal d'identifiants acceptés par requête groupée. */
export const BULK_MAX_IDS = 200

export interface BulkFailure {
  id: string
  error: string
}

export interface BulkResult {
  succeeded: string[]
  failed: BulkFailure[]
}

/** Erreur attendue sur un élément : il est reporté dans `failed`, le lot continue. */
export class BulkItemError extends Error {}

export type BulkIdsParse = { ok: true; ids: string[] } | { ok: false; error: string }

/**
 * Valide `ids` : tableau non vide, 200 au plus, ObjectId uniquement.
 * Les doublons sont écartés ; un seul identifiant invalide refuse tout le lot
 * (une erreur de client ne doit jamais produire une action à moitié appliquée).
 */
export function parseBulkIds(raw: unknown): BulkIdsParse {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'ids doit être un tableau non vide' }
  if (raw.length > BULK_MAX_IDS) return { ok: false, error: `ids est limité à ${BULK_MAX_IDS} éléments` }
  const invalid = raw.filter((id) => typeof id !== 'string' || !mongoose.isValidObjectId(id) || id.length !== 24)
  if (invalid.length > 0) return { ok: false, error: 'ids contient des identifiants invalides' }
  return { ok: true, ids: [...new Set((raw as string[]).map((id) => id.toLowerCase()))] }
}

/** Exécute `handler` pour chaque id, en séquence, et agrège succès et échecs. */
export async function runBulk(ids: string[], handler: (id: string) => Promise<void>): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] }
  for (const id of ids) {
    try {
      await handler(id)
      result.succeeded.push(id)
    } catch (err) {
      result.failed.push({ id, error: err instanceof BulkItemError ? err.message : 'Erreur serveur' })
    }
  }
  return result
}
