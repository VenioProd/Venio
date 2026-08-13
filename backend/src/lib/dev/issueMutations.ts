import mongoose from 'mongoose'
import DevIssue, {
  DEV_AI_MODELS,
  DEV_REASONING_EFFORTS,
  type IDevIssue,
  type DevIssueExecutionProfile,
  type DevIssueExternalRef,
  type DevIssueRelation,
  type DevIssueSource,
} from '../../models/DevIssue.js'
import DevIssueEvent, { type DevIssueEventType } from '../../models/DevIssueEvent.js'

export const CLOSED_ISSUE_STATUSES = ['DONE', 'DUPLICATE', 'CANCELLED'] as const

export function isClosedIssueStatus(status: string): boolean {
  return (CLOSED_ISSUE_STATUSES as readonly string[]).includes(status)
}

export function applyStatusTimestamps(issue: IDevIssue, nextStatus: IDevIssue['status']): void {
  const statusChanged = nextStatus !== issue.status
  if ((nextStatus === 'IN_PROGRESS' || nextStatus === 'IN_REVIEW') && !issue.startedAt) {
    issue.startedAt = new Date()
  }
  if ((nextStatus === 'DONE' || nextStatus === 'DUPLICATE') && !issue.completedAt) {
    issue.completedAt = new Date()
  }
  if (statusChanged && nextStatus !== 'DONE' && nextStatus !== 'DUPLICATE') issue.completedAt = null
  issue.status = nextStatus
}

function cleanString(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function cleanStringList(raw: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((v) => v.slice(0, maxLength))
}

function cleanObjectIds(raw: unknown, maxItems: number): mongoose.Types.ObjectId[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((v): v is string => typeof v === 'string' && mongoose.isValidObjectId(v))
    .slice(0, maxItems)
    .map((v) => new mongoose.Types.ObjectId(v))
}

function cleanRelations(raw: unknown): DevIssueRelation[] | null {
  if (!Array.isArray(raw)) return null
  const allowed = new Set(['blocks', 'blocked_by', 'relates_to', 'duplicates'])
  return raw
    .filter((r): r is { type: string; issue: string } => {
      return !!r && typeof r === 'object' && typeof r.type === 'string' && typeof r.issue === 'string'
    })
    .filter((r) => allowed.has(r.type) && mongoose.isValidObjectId(r.issue))
    .slice(0, 24)
    .map((r) => ({ type: r.type as DevIssueRelation['type'], issue: new mongoose.Types.ObjectId(r.issue) }))
}

function cleanExecutionProfile(raw: unknown): DevIssueExecutionProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const profile = raw as Partial<DevIssueExecutionProfile>
  const model =
    typeof profile.recommendedModel === 'string' &&
    (DEV_AI_MODELS as readonly string[]).includes(profile.recommendedModel)
      ? profile.recommendedModel
      : null
  const reasoningEffort =
    typeof profile.reasoningEffort === 'string' &&
    (DEV_REASONING_EFFORTS as readonly string[]).includes(profile.reasoningEffort)
      ? profile.reasoningEffort
      : null
  return {
    recommendedModel: model as DevIssueExecutionProfile['recommendedModel'],
    reasoningEffort: reasoningEffort as DevIssueExecutionProfile['reasoningEffort'],
    context: typeof profile.context === 'string' ? profile.context.trim().slice(0, 6000) : '',
    executionPlan: typeof profile.executionPlan === 'string' ? profile.executionPlan.trim().slice(0, 6000) : '',
    verificationPlan:
      typeof profile.verificationPlan === 'string' ? profile.verificationPlan.trim().slice(0, 4000) : '',
    handoff: typeof profile.handoff === 'string' ? profile.handoff.trim().slice(0, 4000) : '',
  }
}

export function applyIssueV2Patch(issue: IDevIssue, body: Record<string, unknown>): string[] {
  const changed: string[] = []

  if (body.estimate === null) {
    issue.estimate = null
    changed.push('estimate')
  } else if (typeof body.estimate === 'number' && Number.isFinite(body.estimate) && body.estimate >= 0) {
    issue.estimate = Math.min(999, Math.round(body.estimate))
    changed.push('estimate')
  }

  if (body.rank === null) {
    issue.rank = null
    changed.push('rank')
  } else {
    const rank = cleanString(body.rank, 80)
    if (rank !== null) {
      issue.rank = rank
      changed.push('rank')
    }
  }

  if (body.cycle === null) {
    issue.cycle = null
    changed.push('cycle')
  } else {
    const cycle = cleanString(body.cycle, 120)
    if (cycle !== null) {
      issue.cycle = cycle
      changed.push('cycle')
    }
  }

  if (body.parent === null) {
    issue.parent = null
    changed.push('parent')
  } else if (typeof body.parent === 'string' && mongoose.isValidObjectId(body.parent)) {
    issue.parent = new mongoose.Types.ObjectId(body.parent)
    changed.push('parent')
  }

  const relations = cleanRelations(body.relations)
  if (relations) {
    issue.relations = relations
    changed.push('relations')
  }

  if (body.source === null) {
    issue.source = null
    changed.push('source')
  } else if (body.source && typeof body.source === 'object') {
    const source = body.source as Partial<DevIssueSource>
    const kinds = new Set(['manual', 'agent', 'linear', 'github', 'import'])
    if (typeof source.kind === 'string' && kinds.has(source.kind)) {
      issue.source = { kind: source.kind as DevIssueSource['kind'], name: cleanString(source.name, 120) }
      changed.push('source')
    }
  }

  if (body.external === null) {
    issue.external = null
    changed.push('external')
  } else if (body.external && typeof body.external === 'object') {
    const external = body.external as Partial<DevIssueExternalRef>
    issue.external = {
      linearId: cleanString(external.linearId, 120),
      linearUrl: cleanString(external.linearUrl, 500),
      linearIdentifier: cleanString(external.linearIdentifier, 80),
    }
    changed.push('external')
  }

  if (body.agentAssignee === null) {
    issue.agentAssignee = null
    changed.push('agentAssignee')
  } else {
    const agentAssignee = cleanString(body.agentAssignee, 80)
    if (agentAssignee !== null) {
      issue.agentAssignee = agentAssignee
      changed.push('agentAssignee')
    }
  }

  if (body.executionProfile === null) {
    issue.executionProfile = null
    changed.push('executionProfile')
  } else {
    const executionProfile = cleanExecutionProfile(body.executionProfile)
    if (executionProfile) {
      issue.executionProfile = executionProfile
      changed.push('executionProfile')
    }
  }

  const acceptanceCriteria = cleanStringList(body.acceptanceCriteria, 40, 500)
  if (acceptanceCriteria) {
    issue.acceptanceCriteria = acceptanceCriteria
    changed.push('acceptanceCriteria')
  }
  const subtasks = cleanStringList(body.subtasks, 80, 300)
  if (subtasks) {
    issue.subtasks = subtasks
    changed.push('subtasks')
  }

  if (body.blockedReason === null) {
    issue.blockedReason = null
    changed.push('blockedReason')
  } else {
    const blockedReason = cleanString(body.blockedReason, 2000)
    if (blockedReason !== null) {
      issue.blockedReason = blockedReason
      changed.push('blockedReason')
    }
  }

  const blockedBy = cleanObjectIds(body.blockedBy, 24)
  if (blockedBy) {
    issue.blockedBy = blockedBy
    changed.push('blockedBy')
  }

  if (body.duplicateOf === null) {
    issue.duplicateOf = null
    changed.push('duplicateOf')
  } else if (typeof body.duplicateOf === 'string' && mongoose.isValidObjectId(body.duplicateOf)) {
    issue.duplicateOf = new mongoose.Types.ObjectId(body.duplicateOf)
    changed.push('duplicateOf')
  }

  return changed
}

const RELATION_TYPES = new Set(['blocks', 'blocked_by', 'relates_to', 'duplicates'])

function parseReferenceIds(body: Record<string, unknown>): { ids: string[]; error: string | null } {
  const ids: string[] = []
  for (const field of ['parent', 'duplicateOf'] as const) {
    const value = body[field]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
      return { ids: [], error: `${field} invalide` }
    }
    ids.push(value)
  }

  if (body.blockedBy !== undefined) {
    if (!Array.isArray(body.blockedBy) || body.blockedBy.length > 24) {
      return { ids: [], error: 'blockedBy doit contenir au maximum 24 identifiants' }
    }
    for (const value of body.blockedBy) {
      if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
        return { ids: [], error: 'blockedBy contient un identifiant invalide' }
      }
      ids.push(value)
    }
  }

  if (body.relations !== undefined) {
    if (!Array.isArray(body.relations) || body.relations.length > 24) {
      return { ids: [], error: 'relations doit contenir au maximum 24 liens' }
    }
    for (const value of body.relations) {
      if (!value || typeof value !== 'object') return { ids: [], error: 'Relation invalide' }
      const relation = value as { type?: unknown; issue?: unknown }
      if (
        typeof relation.type !== 'string' ||
        !RELATION_TYPES.has(relation.type) ||
        typeof relation.issue !== 'string' ||
        !mongoose.isValidObjectId(relation.issue)
      ) {
        return { ids: [], error: 'Relation invalide' }
      }
      ids.push(relation.issue)
    }
  }

  return { ids, error: null }
}

async function chainReachesIssue(
  startIds: string[],
  field: 'parent' | 'blockedBy' | 'duplicateOf',
  issueId: string,
  projectId: mongoose.Types.ObjectId | string,
): Promise<boolean> {
  const pending = [...startIds]
  const visited = new Set<string>()
  while (pending.length > 0 && visited.size < 200) {
    const current = pending.shift()!
    if (current === issueId) return true
    if (visited.has(current)) continue
    visited.add(current)
    const linked = await DevIssue.findOne({ _id: current, project: projectId, archivedAt: null }).select(field).lean()
    if (!linked) continue
    const raw = linked[field]
    const next = Array.isArray(raw) ? raw : raw ? [raw] : []
    pending.push(...next.map(String))
  }
  // A graph this deep is rejected conservatively instead of allowing an
  // unverified link or spending unbounded time in a mutation request.
  return pending.length > 0
}

/** Validate issue links before applying a patch so cross-project and cyclic graphs cannot be persisted. */
export async function validateIssueReferences(input: {
  projectId: mongoose.Types.ObjectId | string
  issueId?: mongoose.Types.ObjectId | string
  body: Record<string, unknown>
}): Promise<string | null> {
  const { ids, error } = parseReferenceIds(input.body)
  if (error) return error
  if (ids.length === 0) return null

  const uniqueIds = [...new Set(ids)]
  const issueId = input.issueId ? String(input.issueId) : null
  if (issueId && uniqueIds.includes(issueId)) return 'Une issue ne peut pas se référencer elle-même'

  const validCount = await DevIssue.countDocuments({
    _id: { $in: uniqueIds },
    project: input.projectId,
    archivedAt: null,
  })
  if (validCount !== uniqueIds.length)
    return 'Toutes les issues liées doivent appartenir au même projet et être actives'
  if (!issueId) return null

  const parent = input.body.parent
  if (typeof parent === 'string' && (await chainReachesIssue([parent], 'parent', issueId, input.projectId))) {
    return 'La relation parent créerait un cycle'
  }
  const blockedBy = input.body.blockedBy
  if (
    Array.isArray(blockedBy) &&
    (await chainReachesIssue(blockedBy as string[], 'blockedBy', issueId, input.projectId))
  ) {
    return 'La relation de blocage créerait un cycle'
  }
  const duplicateOf = input.body.duplicateOf
  if (
    typeof duplicateOf === 'string' &&
    (await chainReachesIssue([duplicateOf], 'duplicateOf', issueId, input.projectId))
  ) {
    return 'La relation de duplication créerait un cycle'
  }
  return null
}

export async function recordIssueEvent(input: {
  issue: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  actor?: mongoose.Types.ObjectId | string | null
  type: DevIssueEventType
  summary?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await DevIssueEvent.create({
    issue: input.issue,
    project: input.project,
    actor: input.actor ? new mongoose.Types.ObjectId(input.actor) : null,
    type: input.type,
    summary: input.summary ?? '',
    metadata: input.metadata ?? {},
  })
}
