import mongoose from 'mongoose'
import DevProject, { type DevProjectStatus, type IDevProject } from '../../models/DevProject.js'

/**
 * Archivage des projets du Dev Tracker.
 *
 * Archiver un projet change uniquement son statut (+ archivedAt) : les tickets ne sont
 * jamais modifiés. Les listes et compteurs excluent les projets ARCHIVED par défaut ;
 * `includeArchived=true` les réintègre.
 */

/** Statuts acceptés par la route agent PATCH /dev/projects/:id. */
export const AGENT_PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const

/** `includeArchived=true` (ou `1`) dans la query string. */
export function parseIncludeArchived(raw: unknown): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === true || v === 'true' || v === '1'
}

/**
 * Applique un changement de statut au document (sans le sauvegarder) et maintient archivedAt.
 * Retourne 'archived' / 'restored' si le passage vers/depuis ARCHIVED a eu lieu, sinon null.
 */
export function applyProjectStatus(
  project: Pick<IDevProject, 'status' | 'archivedAt'>,
  next: DevProjectStatus,
): 'archived' | 'restored' | null {
  const wasArchived = project.status === 'ARCHIVED'
  project.status = next
  if (next === 'ARCHIVED') {
    if (!wasArchived || !project.archivedAt) project.archivedAt = new Date()
    return wasArchived ? null : 'archived'
  }
  project.archivedAt = null
  return wasArchived ? 'restored' : null
}

/** Ids des projets archivés (pour exclure leurs tickets des compteurs). */
export async function archivedProjectIds(): Promise<mongoose.Types.ObjectId[]> {
  const rows = await DevProject.find({ status: 'ARCHIVED' }).select('_id').lean()
  return rows.map((r) => r._id as mongoose.Types.ObjectId)
}

export function projectAuditAction(change: 'archived' | 'restored') {
  return change === 'archived' ? ('DEV_PROJECT_ARCHIVED' as const) : ('DEV_PROJECT_RESTORED' as const)
}
