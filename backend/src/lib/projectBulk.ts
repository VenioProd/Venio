import mongoose from 'mongoose'
import Project from '../models/Project.js'
import User from '../models/User.js'
import { deleteProject } from './projectDeletion.js'

export const BULK_ACTIONS = ['archive', 'unarchive', 'set-status', 'set-assignee', 'delete'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]
export const BULK_MAX_IDS = 100
const STATUSES = ['EN_COURS', 'EN_ATTENTE', 'TERMINE']

export interface BulkRequest {
  action: BulkAction
  ids: string[]
  /** Statut cible (`set-status`) ou identifiant du responsable, `null` pour retirer (`set-assignee`). */
  value?: string | null
}

export interface BulkResult {
  id: string
  ok: boolean
  error?: string
}

/** Valide le corps d'une demande groupée ; renvoie un message d'erreur ou la demande nettoyée. */
export function parseBulkRequest(body: unknown): { error: string } | { request: BulkRequest } {
  const b = (body ?? {}) as Record<string, unknown>
  if (!BULK_ACTIONS.includes(b.action as BulkAction)) return { error: `action doit valoir ${BULK_ACTIONS.join(', ')}` }
  if (!Array.isArray(b.ids) || b.ids.length === 0) return { error: 'ids doit être une liste non vide' }
  if (b.ids.length > BULK_MAX_IDS) return { error: `${BULK_MAX_IDS} projets au maximum par demande` }
  const ids = [...new Set(b.ids.map(String))]
  if (!ids.every((id) => mongoose.isValidObjectId(id))) return { error: 'ids contient un identifiant invalide' }
  const action = b.action as BulkAction
  if (action === 'set-status' && !STATUSES.includes(String(b.value)))
    return { error: `value doit valoir ${STATUSES.join(', ')}` }
  if (action === 'set-assignee' && b.value != null && !mongoose.isValidObjectId(b.value))
    return { error: 'value doit être un identifiant ou null' }
  return { request: { action, ids, value: b.value == null ? null : String(b.value) } }
}

/**
 * Applique l'action à chaque projet, indépendamment : un échec n'arrête pas les autres.
 * `allowedIds` restreint le périmètre (null = tout) ; hors périmètre, le projet répond « introuvable ».
 */
export async function applyBulk(request: BulkRequest, allowedIds: string[] | null): Promise<BulkResult[]> {
  const allowed = allowedIds ? new Set(allowedIds) : null
  let assignee: { _id: unknown; name: string } | null = null
  if (request.action === 'set-assignee' && request.value) {
    const u = await User.findById(request.value).select('name role').lean()
    if (!u || u.role === 'CLIENT') {
      return request.ids.map((id) => ({ id, ok: false, error: 'Responsable invalide' }))
    }
    assignee = { _id: u._id, name: u.name }
  }

  const results: BulkResult[] = []
  for (const id of request.ids) {
    if (allowed && !allowed.has(id)) {
      results.push({ id, ok: false, error: 'Projet introuvable' })
      continue
    }
    try {
      let found = true
      switch (request.action) {
        case 'archive':
        case 'unarchive':
          found = !!(await Project.findByIdAndUpdate(id, { isArchived: request.action === 'archive' }))
          break
        case 'set-status': {
          const set: Record<string, unknown> = { status: request.value }
          if (request.value === 'TERMINE') set.deliveredAt = new Date()
          found = !!(await Project.findByIdAndUpdate(id, set))
          break
        }
        case 'set-assignee':
          found = !!(await Project.findByIdAndUpdate(id, {
            assignedTo: assignee ? assignee._id : null,
            responsible: assignee ? assignee.name : '',
          }))
          break
        case 'delete':
          found = !!(await deleteProject(id))
          break
      }
      results.push(found ? { id, ok: true } : { id, ok: false, error: 'Projet introuvable' })
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Erreur' })
    }
  }
  return results
}
