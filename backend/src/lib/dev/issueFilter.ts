import mongoose from 'mongoose'
import type { Request } from 'express'
import { DEV_ISSUE_STATUSES, DEV_ISSUE_PRIORITIES, DEV_ISSUE_TYPES } from '../../models/DevIssue.js'
import { CLOSED_ISSUE_STATUSES } from './issueMutations.js'
import { BLOCKER_MATCH } from './blockers.js'
const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)
const ACTIVE_ISSUE_FILTER = { archivedAt: null }

export function issueFilter(query: Request['query'], userId: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...ACTIVE_ISSUE_FILTER }
  const { project, status, priority, type, assignee, q, label, cycle, agentAssignee, includeArchived, blocked } = query
  if (includeArchived === 'true') delete filter.archivedAt

  if (typeof project === 'string') {
    if (isObjectId(project)) filter.project = new mongoose.Types.ObjectId(project)
    else if (project !== 'all' && project) return { _id: { $in: [] } }
  }

  if (typeof status === 'string') {
    if (status === 'open') filter.status = { $nin: CLOSED_ISSUE_STATUSES }
    else if ((DEV_ISSUE_STATUSES as readonly string[]).includes(status)) filter.status = status
  }
  if (typeof priority === 'string' && (DEV_ISSUE_PRIORITIES as readonly string[]).includes(priority)) {
    filter.priority = priority
  }
  if (typeof type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(type)) {
    filter.type = type
  }
  if (typeof assignee === 'string') {
    if (assignee === 'me') filter.assignee = new mongoose.Types.ObjectId(userId)
    else if (assignee === 'unassigned') filter.assignee = null
    else if (isObjectId(assignee)) filter.assignee = new mongoose.Types.ObjectId(assignee)
  }
  if (typeof label === 'string' && label.trim()) {
    filter.labels = label.trim().toLowerCase()
  }
  if (typeof cycle === 'string' && cycle.trim()) filter.cycle = cycle.trim()
  if (typeof agentAssignee === 'string' && agentAssignee.trim()) filter.agentAssignee = agentAssignee.trim()
  if (typeof q === 'string' && q.trim()) {
    const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { title: { $regex: safe, $options: 'i' } },
      { identifier: { $regex: safe, $options: 'i' } },
      { description: { $regex: safe, $options: 'i' } },
      { 'external.linearIdentifier': { $regex: safe, $options: 'i' } },
    ]
  }

  if (blocked === 'true') filter.$and = [BLOCKER_MATCH, { status: { $nin: CLOSED_ISSUE_STATUSES } }]
  return filter
}
