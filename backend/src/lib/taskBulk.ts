import fs from 'node:fs'
import mongoose from 'mongoose'
import Task from '../models/Task.js'
import TaskComment from '../models/TaskComment.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import { createNotification } from './notifications.js'
import { logActivity } from './activityLog.js'
import { sendTaskAssignedEmail } from './email.js'
import { BulkItemError, parseBulkIds, runBulk, type BulkResult } from './bulk.js'

export const BULK_TASK_STATUSES = [
  'A_FAIRE',
  'EN_COURS',
  'EN_REVIEW',
  'TERMINE',
  'VALIDE',
  'NON_VALIDE',
  'A_MODIFIER',
] as const
export const BULK_TASK_PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'] as const
export const TASK_BULK_ACTIONS = ['delete', 'archive', 'unarchive', 'update'] as const

export type TaskBulkAction = (typeof TASK_BULK_ACTIONS)[number]

export interface TaskBulkPatch {
  status?: (typeof BULK_TASK_STATUSES)[number]
  priority?: (typeof BULK_TASK_PRIORITIES)[number]
  assignee?: string | null
  dueDate?: Date | null
}

export type TaskBulkParse =
  { ok: true; ids: string[]; action: TaskBulkAction; patch: TaskBulkPatch } | { ok: false; error: string }

const PATCH_KEYS = ['status', 'priority', 'assignee', 'dueDate']

/** Valide le corps `{ ids, action, patch? }`. Toute clé de patch inconnue est refusée. */
export function parseTaskBulkBody(body: unknown): TaskBulkParse {
  const b = (body ?? {}) as Record<string, unknown>
  const parsed = parseBulkIds(b.ids)
  if (!parsed.ok) return parsed
  if (typeof b.action !== 'string' || !(TASK_BULK_ACTIONS as readonly string[]).includes(b.action)) {
    return { ok: false, error: `action doit valoir ${TASK_BULK_ACTIONS.join(', ')}` }
  }
  const action = b.action as TaskBulkAction
  const patch: TaskBulkPatch = {}
  if (action === 'update') {
    const raw = b.patch
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'patch requis pour update' }
    const p = raw as Record<string, unknown>
    const unknown = Object.keys(p).filter((k) => !PATCH_KEYS.includes(k))
    if (unknown.length > 0) return { ok: false, error: `patch : champs non pris en charge (${unknown.join(', ')})` }
    if (Object.keys(p).length === 0) return { ok: false, error: 'patch ne contient aucun champ' }
    if (p.status !== undefined) {
      if (typeof p.status !== 'string' || !(BULK_TASK_STATUSES as readonly string[]).includes(p.status)) {
        return { ok: false, error: 'Statut invalide' }
      }
      patch.status = p.status as TaskBulkPatch['status']
    }
    if (p.priority !== undefined) {
      if (typeof p.priority !== 'string' || !(BULK_TASK_PRIORITIES as readonly string[]).includes(p.priority)) {
        return { ok: false, error: 'Priorité invalide' }
      }
      patch.priority = p.priority as TaskBulkPatch['priority']
    }
    if (p.assignee !== undefined) {
      if (p.assignee === null || p.assignee === '') patch.assignee = null
      else if (typeof p.assignee === 'string' && mongoose.isValidObjectId(p.assignee) && p.assignee.length === 24) {
        patch.assignee = p.assignee
      } else return { ok: false, error: 'assignee invalide' }
    }
    if (p.dueDate !== undefined) {
      if (p.dueDate === null || p.dueDate === '') patch.dueDate = null
      else {
        const d = typeof p.dueDate === 'string' ? new Date(p.dueDate) : null
        if (!d || Number.isNaN(d.getTime())) return { ok: false, error: 'dueDate invalide' }
        patch.dueDate = d
      }
    }
  } else if (b.patch !== undefined) {
    return { ok: false, error: 'patch n’est accepté que pour update' }
  }
  return { ok: true, ids: parsed.ids, action, patch }
}

export interface TaskBulkContext {
  /** Refuse une tâche précise : renvoie le message d'échec, ou null si elle est permise. */
  authorize?: (task: { _id: unknown; project: unknown }) => string | null
  /** Auteur du journal d'activité et des notifications ; absent pour l'API agent. */
  actor?: { id: string; name?: string }
  /** Supprime aussi les commentaires (comportement du DELETE agent). */
  deleteComments?: boolean
}

/** Applique l'action groupée et renvoie `{ succeeded, failed }`. */
export async function applyTaskBulk(
  input: { ids: string[]; action: TaskBulkAction; patch: TaskBulkPatch },
  ctx: TaskBulkContext = {},
): Promise<BulkResult> {
  const { ids, action, patch } = input
  const tasks = await Task.find({ _id: { $in: ids } })
  const byId = new Map(tasks.map((t) => [String(t._id), t]))
  const projectNames = new Map<string, string>()
  const projectName = async (projectId: string): Promise<string> => {
    if (!projectNames.has(projectId)) {
      const p = await Project.findById(projectId).select('name').lean()
      projectNames.set(projectId, p?.name ?? '')
    }
    return projectNames.get(projectId) ?? ''
  }
  const log = async (task: { project: unknown; _id: unknown; title: string }, act: string, summary: string) => {
    if (!ctx.actor) return
    await logActivity({
      project: String(task.project),
      action: act,
      actor: ctx.actor.id,
      summary,
      metadata: { taskId: task._id, bulk: true },
    })
  }

  return runBulk(ids, async (id) => {
    const task = byId.get(id)
    if (!task) throw new BulkItemError('Tâche non trouvée')
    const denied = ctx.authorize?.(task)
    if (denied) throw new BulkItemError(denied)

    if (action === 'delete') {
      await Task.deleteOne({ _id: task._id })
      for (const att of task.attachments ?? []) {
        try {
          if (att.storagePath && fs.existsSync(att.storagePath)) fs.unlinkSync(att.storagePath)
        } catch {
          // Un fichier déjà disparu ne doit pas faire échouer la suppression de la tâche.
        }
      }
      if (ctx.deleteComments) await TaskComment.deleteMany({ task: task._id })
      await log(task, 'TASK_DELETED', `Tâche supprimée : ${task.title}`)
      return
    }

    if (action === 'archive' || action === 'unarchive') {
      task.isArchived = action === 'archive'
      await task.save()
      await log(task, 'TASK_UPDATED', `Tâche ${action === 'archive' ? 'archivée' : 'désarchivée'} : ${task.title}`)
      return
    }

    const oldAssignee = task.assignee ? String(task.assignee) : null
    if (patch.status !== undefined) task.status = patch.status
    if (patch.priority !== undefined) task.priority = patch.priority
    if (patch.assignee !== undefined) {
      task.assignee = (patch.assignee ?? null) as unknown as typeof task.assignee
    }
    if (patch.dueDate !== undefined) task.dueDate = patch.dueDate
    await task.save()
    await log(task, 'TASK_UPDATED', `Tâche modifiée : ${task.title}`)

    const newAssignee = task.assignee ? String(task.assignee) : null
    if (ctx.actor && newAssignee && newAssignee !== oldAssignee && newAssignee !== ctx.actor.id) {
      const projectId = String(task.project)
      const name = await projectName(projectId)
      await createNotification({
        recipient: newAssignee,
        type: 'TASK_ASSIGNED',
        title: `Tâche assignée : ${task.title}`,
        message: `Vous avez été assigné à la tâche "${task.title}" sur le projet "${name}"`,
        link: `/admin/projets/${projectId}?tab=tasks`,
      })
      const assigneeUser = await User.findById(newAssignee)
      if (assigneeUser?.email) {
        sendTaskAssignedEmail({
          to: assigneeUser.email,
          assigneeName: assigneeUser.name || assigneeUser.email,
          taskTitle: task.title,
          projectName: name,
          projectId,
          assignedBy: ctx.actor.name || 'Un administrateur',
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
          priority: task.priority || null,
        }).catch(() => {})
      }
    }
  })
}
