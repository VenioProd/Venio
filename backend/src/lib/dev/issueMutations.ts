import mongoose from 'mongoose'
import type { IDevIssue, DevIssueExternalRef, DevIssueRelation, DevIssueSource } from '../../models/DevIssue.js'
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
