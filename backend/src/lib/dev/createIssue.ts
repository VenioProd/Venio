import mongoose from 'mongoose'
import DevIssue, {
  type DevIssueStatus,
  type DevIssuePriority,
  type DevIssueType,
  type IDevIssue,
} from '../../models/DevIssue.js'
import DevProject from '../../models/DevProject.js'
import { applyStatusTimestamps } from './issueMutations.js'

export interface CreateIssueInput {
  project: mongoose.Types.ObjectId
  projectKey: string
  title: string
  description?: string
  type: DevIssueType
  status: DevIssueStatus
  priority: DevIssuePriority
  reporter: mongoose.Types.ObjectId
  assignee?: mongoose.Types.ObjectId | string | null
  labels?: string[]
  dueDate?: Date | null
  estimate?: number | null
  rank?: string | null
  cycle?: string | null
  source?: IDevIssue['source']
  external?: IDevIssue['external']
  agentAssignee?: string | null
  createdByModel?: string | null
  acceptanceCriteria?: string[]
  subtasks?: string[]
  blockedReason?: string | null
  blockedBy?: mongoose.Types.ObjectId[]
  duplicateOf?: mongoose.Types.ObjectId | null
}

const DUPLICATE_KEY_ERROR_CODE = 11000
const MAX_RETRIES = 5

interface MongoDuplicateError extends Error {
  code?: number
  keyPattern?: Record<string, unknown>
  keyValue?: Record<string, unknown>
}

function isDuplicateNumberError(err: unknown): boolean {
  const e = err as MongoDuplicateError | null
  if (!e || e.code !== DUPLICATE_KEY_ERROR_CODE) return false
  const keys = Object.keys(e.keyPattern || e.keyValue || {})
  return keys.includes('project') && keys.includes('number')
}

/**
 * Atomically reserve the next issue number for a project. Uses
 * `findOneAndUpdate({ $inc: { issueCounter: 1 } })` so concurrent calls
 * never collide.
 *
 * Legacy projects created before the counter field existed start at
 * `issueCounter = 0` — we backfill once from `max(DevIssue.number)` so the
 * counter aligns with already-allocated numbers.
 */
async function allocateNextNumber(projectId: mongoose.Types.ObjectId): Promise<number> {
  const updated = await DevProject.findOneAndUpdate(
    { _id: projectId },
    { $inc: { issueCounter: 1 } },
    { new: true }
  ).select('issueCounter').lean()
  if (!updated) throw new Error('Projet introuvable')

  // If issueCounter <= max existing number, we collided with legacy data.
  // Backfill the counter once from the current max and re-allocate.
  if (updated.issueCounter <= 0) {
    return await backfillAndAllocate(projectId)
  }
  const existing = await DevIssue.findOne({ project: projectId, number: updated.issueCounter })
    .select('_id')
    .lean()
  if (existing) {
    return await backfillAndAllocate(projectId)
  }
  return updated.issueCounter
}

async function backfillAndAllocate(projectId: mongoose.Types.ObjectId): Promise<number> {
  const last = await DevIssue.findOne({ project: projectId }).sort({ number: -1 }).select('number').lean()
  const base = last?.number ?? 0
  // Atomically reset counter to base, then $inc again to allocate.
  await DevProject.updateOne({ _id: projectId }, { $set: { issueCounter: base } })
  const reAllocated = await DevProject.findOneAndUpdate(
    { _id: projectId },
    { $inc: { issueCounter: 1 } },
    { new: true }
  ).select('issueCounter').lean()
  return reAllocated?.issueCounter ?? base + 1
}

/**
 * Create a DevIssue with a per-project sequential `number`.
 *
 * The allocation is atomic via DevProject.issueCounter. If the resulting
 * insert still collides on the `{ project, number }` unique index (eg
 * legacy data not yet backfilled, or external writer), retry by
 * re-allocating a fresh number.
 */
export async function createIssueWithRetry(input: CreateIssueInput): Promise<IDevIssue> {
  const {
    project,
    projectKey,
    title,
    description = '',
    type,
    status,
    priority,
    reporter,
    assignee = null,
    labels = [],
    dueDate = null,
    estimate = null,
    rank = null,
    cycle = null,
    source = null,
    external = null,
    agentAssignee = null,
    createdByModel = null,
    acceptanceCriteria = [],
    subtasks = [],
    blockedReason = null,
    blockedBy = [],
    duplicateOf = null,
  } = input

  let lastErr: unknown = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const number = await allocateNextNumber(project)
    const identifier = `${projectKey}-${number}`
    try {
      const issue = new DevIssue({
        project,
        number,
        identifier,
        title,
        description,
        type,
        status,
        priority,
        assignee: assignee || null,
        reporter,
        labels,
        dueDate: dueDate || null,
        estimate,
        rank,
        cycle,
        source,
        external,
        agentAssignee,
        createdByModel,
        acceptanceCriteria,
        subtasks,
        blockedReason,
        blockedBy,
        duplicateOf,
      })
      applyStatusTimestamps(issue, status)
      await issue.save()
      return issue
    } catch (err) {
      if (isDuplicateNumberError(err)) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr ?? new Error('Impossible d’allouer un numéro d’issue')
}
