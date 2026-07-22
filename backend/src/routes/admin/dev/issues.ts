import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevProject from '../../../models/DevProject.js'
import DevIssue, { DEV_ISSUE_STATUSES, DEV_ISSUE_PRIORITIES, DEV_ISSUE_TYPES } from '../../../models/DevIssue.js'
import DevIssueComment, { DEV_ISSUE_COMMENT_KINDS } from '../../../models/DevIssueComment.js'
import DevIssueEvent from '../../../models/DevIssueEvent.js'
import { createNotification } from '../../../lib/notifications.js'
import { createIssueWithRetry } from '../../../lib/dev/createIssue.js'
import { parseGithubPatch, mergeGithubLink } from '../../../lib/dev/github.js'
import {
  applyIssueV2Patch,
  applyStatusTimestamps,
  CLOSED_ISSUE_STATUSES,
  recordIssueEvent,
} from '../../../lib/dev/issueMutations.js'

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)
const ACTIVE_ISSUE_FILTER = { archivedAt: null }

function parseLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(
      raw
        .filter((l): l is string => typeof l === 'string')
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l.length > 0 && l.length <= 32),
    ),
  ).slice(0, 16)
}

function parseCommentKind(raw: unknown) {
  return typeof raw === 'string' && (DEV_ISSUE_COMMENT_KINDS as readonly string[]).includes(raw) ? raw : 'NOTE'
}

function parseCommentContext(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 2000) : ''
}

// GET /api/admin/dev/issues — filtre principal type Linear
router.get(
  '/issues',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = { ...ACTIVE_ISSUE_FILTER }
      const { project, status, priority, type, assignee, q, label, cycle, agentAssignee, includeArchived } = req.query
      if (includeArchived === 'true') delete filter.archivedAt

      if (typeof project === 'string') {
        if (isObjectId(project)) filter.project = project
        else if (project !== 'all' && project) return res.json({ issues: [] })
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
        if (assignee === 'me') filter.assignee = req.user!.id
        else if (assignee === 'unassigned') filter.assignee = null
        else if (isObjectId(assignee)) filter.assignee = assignee
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

      const issues = await DevIssue.find(filter)
        .populate('assignee', 'name email avatarUrl')
        .populate('reporter', 'name email avatarUrl')
        .populate('project', 'key name color')
        .sort({ rank: 1, updatedAt: -1 })
        .limit(500)
        .lean()
      res.json({ issues })
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/admin/dev/issues — création rapide
router.post(
  '/issues',
  requirePermission(PERMISSIONS.MANAGE_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.body?.project)) return res.status(400).json({ error: 'project requis' })
      const projectDoc = await DevProject.findById(req.body.project)
      if (!projectDoc) return res.status(404).json({ error: 'Projet introuvable' })

      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
      if (!title) return res.status(400).json({ error: 'title requis' })

      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
      const status =
        typeof req.body?.status === 'string' && (DEV_ISSUE_STATUSES as readonly string[]).includes(req.body.status)
          ? req.body.status
          : 'BACKLOG'
      const priority =
        typeof req.body?.priority === 'string' &&
        (DEV_ISSUE_PRIORITIES as readonly string[]).includes(req.body.priority)
          ? req.body.priority
          : 'NO_PRIORITY'
      const type =
        typeof req.body?.type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(req.body.type)
          ? req.body.type
          : 'TASK'
      const assignee = isObjectId(req.body?.assignee) ? req.body.assignee : null
      const labels = parseLabels(req.body?.labels)
      const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null

      const issue = await createIssueWithRetry({
        project: projectDoc._id,
        projectKey: projectDoc.key,
        title: title.slice(0, 200),
        description: description.slice(0, 20000),
        type,
        status,
        priority,
        assignee,
        reporter: new mongoose.Types.ObjectId(req.user!.id),
        labels,
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      })
      const changed = applyIssueV2Patch(issue, req.body)
      if (changed.length) await issue.save()
      const identifier = issue.identifier

      const populated = await DevIssue.findById(issue._id)
        .populate('assignee', 'name email avatarUrl')
        .populate('reporter', 'name email avatarUrl')
        .populate('project', 'key name color')

      // Notif à l'assigné si différent du reporter
      if (assignee && assignee !== req.user!.id) {
        createNotification({
          recipient: assignee,
          type: 'DEV_ISSUE_ASSIGNED',
          title: `Issue assignée — ${identifier}`,
          message: title,
          link: `/admin/dev/issues/${issue._id}`,
          metadata: { issueId: String(issue._id), identifier },
        }).catch(() => {})
      }

      await recordIssueEvent({
        issue: issue._id,
        project: issue.project,
        actor: req.user!.id,
        type: 'created',
        summary: `Issue ${identifier} créée`,
        metadata: { status: issue.status, priority: issue.priority, type: issue.type },
      })

      res.status(201).json(populated)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/admin/dev/issues/:id
router.get(
  '/issues/:id',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
      const issue = await DevIssue.findById(req.params.id)
        .populate('assignee', 'name email avatarUrl')
        .populate('reporter', 'name email avatarUrl')
        .populate('project', 'key name color')
      if (!issue) return res.status(404).json({ error: 'Issue introuvable' })

      const comments = await DevIssueComment.find({ issue: issue._id })
        .populate('author', 'name email avatarUrl')
        .sort({ createdAt: 1 })
        .lean()
      const events = await DevIssueEvent.find({ issue: issue._id })
        .populate('actor', 'name email avatarUrl')
        .sort({ createdAt: 1 })
        .lean()
      res.json({ issue, comments, events })
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/admin/dev/issues/:id
router.patch(
  '/issues/:id',
  requirePermission(PERMISSIONS.MANAGE_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
      const issue = await DevIssue.findById(req.params.id)
      if (!issue) return res.status(404).json({ error: 'Issue introuvable' })

      const oldStatus = issue.status
      const oldPriority = issue.priority
      const oldType = issue.type
      const oldAssignee = issue.assignee ? String(issue.assignee) : null
      const oldGithub = issue.github ? JSON.stringify(issue.github) : null

      if (typeof req.body?.title === 'string' && req.body.title.trim()) {
        issue.title = req.body.title.trim().slice(0, 200)
      }
      if (typeof req.body?.description === 'string') {
        issue.description = req.body.description.slice(0, 20000)
      }
      if (typeof req.body?.type === 'string' && (DEV_ISSUE_TYPES as readonly string[]).includes(req.body.type)) {
        issue.type = req.body.type as typeof issue.type
      }
      if (typeof req.body?.status === 'string' && (DEV_ISSUE_STATUSES as readonly string[]).includes(req.body.status)) {
        const next = req.body.status as typeof issue.status
        applyStatusTimestamps(issue, next)
      }
      if (
        typeof req.body?.priority === 'string' &&
        (DEV_ISSUE_PRIORITIES as readonly string[]).includes(req.body.priority)
      ) {
        issue.priority = req.body.priority as typeof issue.priority
      }
      if (req.body?.assignee === null) issue.assignee = null
      else if (isObjectId(req.body?.assignee)) issue.assignee = new mongoose.Types.ObjectId(req.body.assignee)
      if (Array.isArray(req.body?.labels)) issue.labels = parseLabels(req.body.labels)
      if (req.body?.dueDate === null) issue.dueDate = null
      else if (typeof req.body?.dueDate === 'string') {
        const d = new Date(req.body.dueDate)
        if (!Number.isNaN(d.getTime())) issue.dueDate = d
      }
      const githubPatch = parseGithubPatch(req.body?.github)
      if (githubPatch === null) issue.github = null
      else if (githubPatch !== undefined) issue.github = mergeGithubLink(issue.github, githubPatch)
      const metadataChanged = applyIssueV2Patch(issue, req.body)

      await issue.save()
      const populated = await DevIssue.findById(issue._id)
        .populate('assignee', 'name email avatarUrl')
        .populate('reporter', 'name email avatarUrl')
        .populate('project', 'key name color')

      // Notifs : nouvel assigné + reporter si status changé
      const newAssignee = issue.assignee ? String(issue.assignee) : null
      if (newAssignee && newAssignee !== oldAssignee && newAssignee !== req.user!.id) {
        createNotification({
          recipient: newAssignee,
          type: 'DEV_ISSUE_ASSIGNED',
          title: `Issue assignée — ${issue.identifier}`,
          message: issue.title,
          link: `/admin/dev/issues/${issue._id}`,
          metadata: { issueId: String(issue._id), identifier: issue.identifier },
        }).catch(() => {})
      }
      if (oldStatus !== issue.status && issue.reporter && String(issue.reporter) !== req.user!.id) {
        createNotification({
          recipient: issue.reporter,
          type: 'DEV_ISSUE_STATUS_CHANGED',
          title: `${issue.identifier} → ${issue.status}`,
          message: issue.title,
          link: `/admin/dev/issues/${issue._id}`,
          metadata: { issueId: String(issue._id), identifier: issue.identifier, status: issue.status },
        }).catch(() => {})
      }

      const eventBase = { issue: issue._id, project: issue.project, actor: req.user!.id }
      if (oldStatus !== issue.status) {
        await recordIssueEvent({
          ...eventBase,
          type: 'status_changed',
          summary: `${issue.identifier} ${oldStatus} → ${issue.status}`,
          metadata: { from: oldStatus, to: issue.status },
        })
      }
      if (oldPriority !== issue.priority) {
        await recordIssueEvent({
          ...eventBase,
          type: 'priority_changed',
          summary: `${issue.identifier} priorité ${oldPriority} → ${issue.priority}`,
          metadata: { from: oldPriority, to: issue.priority },
        })
      }
      if (oldType !== issue.type) {
        await recordIssueEvent({
          ...eventBase,
          type: 'type_changed',
          summary: `${issue.identifier} type ${oldType} → ${issue.type}`,
          metadata: { from: oldType, to: issue.type },
        })
      }
      if (oldAssignee !== newAssignee) {
        await recordIssueEvent({
          ...eventBase,
          type: 'assigned',
          summary: `${issue.identifier} assignation modifiée`,
          metadata: { from: oldAssignee, to: newAssignee },
        })
      }
      const newGithub = issue.github ? JSON.stringify(issue.github) : null
      if (oldGithub !== newGithub) {
        await recordIssueEvent({
          ...eventBase,
          type: 'github_linked',
          summary: `${issue.identifier} lien GitHub mis à jour`,
          metadata: { github: issue.github },
        })
      }
      if (metadataChanged.length) {
        await recordIssueEvent({
          ...eventBase,
          type: 'metadata_changed',
          summary: `${issue.identifier} métadonnées mises à jour`,
          metadata: { fields: metadataChanged },
        })
      }

      res.json(populated)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/admin/dev/issues/:id
router.delete(
  '/issues/:id',
  requirePermission(PERMISSIONS.MANAGE_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
      const issue = await DevIssue.findById(req.params.id)
      if (!issue) return res.status(404).json({ error: 'Issue introuvable' })
      issue.archivedAt = new Date()
      await issue.save()
      await recordIssueEvent({
        issue: issue._id,
        project: issue.project,
        actor: req.user!.id,
        type: 'archived',
        summary: `${issue.identifier} archivée`,
        metadata: {},
      })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/admin/dev/issues/:id/comments
router.get(
  '/issues/:id/comments',
  requirePermission(PERMISSIONS.VIEW_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
      const comments = await DevIssueComment.find({ issue: req.params.id })
        .populate('author', 'name email avatarUrl')
        .sort({ createdAt: 1 })
        .lean()
      res.json({ comments })
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/admin/dev/issues/:id/comments
router.post(
  '/issues/:id/comments',
  requirePermission(PERMISSIONS.MANAGE_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
      if (!body) return res.status(400).json({ error: 'body requis' })

      const issue = await DevIssue.findById(req.params.id).select('_id project')
      if (!issue) return res.status(404).json({ error: 'Issue introuvable' })

      const comment = await DevIssueComment.create({
        issue: issue._id,
        project: issue.project,
        author: req.user!.id,
        body: body.slice(0, 10000),
        kind: parseCommentKind(req.body?.kind),
        context: parseCommentContext(req.body?.context),
      })

      // Touch the parent issue so it bubbles up in list views.
      await DevIssue.updateOne({ _id: issue._id }, { $set: { updatedAt: new Date() } })

      const populated = await DevIssueComment.findById(comment._id).populate('author', 'name email avatarUrl')
      await recordIssueEvent({
        issue: issue._id,
        project: issue.project,
        actor: req.user!.id,
        type: 'commented',
        summary: `${comment.kind} ajouté`,
        metadata: { commentId: String(comment._id), kind: comment.kind, context: comment.context },
      })
      res.status(201).json(populated)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/admin/dev/issues/:id/comments/:commentId
router.delete(
  '/issues/:id/comments/:commentId',
  requirePermission(PERMISSIONS.MANAGE_DEV),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.params.id) || !isObjectId(req.params.commentId)) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const comment = await DevIssueComment.findById(req.params.commentId)
      if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' })

      // Auteur OU SUPER_ADMIN peuvent supprimer
      if (comment.author.toString() !== req.user!.id && req.user!.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Non autorisé' })
      }
      await comment.deleteOne()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

export default router
