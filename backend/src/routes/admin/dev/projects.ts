import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevProject, { DEV_PROJECT_STATUSES, type DevProjectGithubConfig } from '../../../models/DevProject.js'
import DevIssue from '../../../models/DevIssue.js'
import DevIssueComment from '../../../models/DevIssueComment.js'
import { notifyUsers } from '../../../lib/notifyHelpers.js'
import { invalidateCodeMetricsCache } from '../../../lib/dev/codeMetrics.js'

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

function sanitizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(trimmed)) return null
  return trimmed
}

function sanitizeString(raw: unknown, maxLength: number): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

// Reject anything that looks like a path-traversal attempt. The resolver does
// the final containment check at scan time, but this catches typos earlier.
function sanitizeRepoPath(raw: unknown): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  if (t.startsWith('/') || t.startsWith('\\') || t.includes('..')) return null
  return t.slice(0, 200)
}

/**
 * Parse a github config patch sent over PATCH. Accepts a partial object whose
 * keys are validated individually. Unknown keys are ignored.
 *
 *   - `null` → caller wants to clear the config
 *   - object → individual fields applied; missing fields preserved
 */
export function parseProjectGithubPatch(
  raw: unknown
): Partial<DevProjectGithubConfig> | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'object') return undefined
  const src = raw as Record<string, unknown>
  const out: Partial<DevProjectGithubConfig> = {}
  if ('owner' in src) out.owner = sanitizeString(src.owner, 80)
  if ('repo' in src) out.repo = sanitizeString(src.repo, 120)
  if ('defaultBranch' in src) out.defaultBranch = sanitizeString(src.defaultBranch, 80)
  if ('htmlUrl' in src) {
    const url = sanitizeString(src.htmlUrl, 300)
    out.htmlUrl = url && /^https?:\/\//i.test(url) ? url : null
  }
  if ('repoPath' in src) out.repoPath = sanitizeRepoPath(src.repoPath)
  return out
}

function mergeGithubConfig(
  prev: DevProjectGithubConfig | null,
  patch: Partial<DevProjectGithubConfig>
): DevProjectGithubConfig {
  const base: DevProjectGithubConfig = prev ?? {
    owner: null,
    repo: null,
    defaultBranch: null,
    htmlUrl: null,
    repoPath: null,
  }
  return { ...base, ...patch }
}

// GET /api/admin/dev/projects
router.get('/projects', requirePermission(PERMISSIONS.VIEW_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {}
    const { status } = req.query
    if (typeof status === 'string' && (DEV_PROJECT_STATUSES as readonly string[]).includes(status)) {
      filter.status = status
    }
    const projects = await DevProject.find(filter)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .lean()

    // Compute open-issue counts per project for the list view
    const ids = projects.map((p) => p._id)
    const counts = ids.length
      ? await DevIssue.aggregate([
          { $match: { project: { $in: ids }, status: { $nin: ['DONE', 'CANCELLED'] } } },
          { $group: { _id: '$project', count: { $sum: 1 } } },
        ])
      : []
    const countMap: Record<string, number> = {}
    for (const c of counts) countMap[String(c._id)] = c.count

    const enriched = projects.map((p) => ({
      ...p,
      openIssues: countMap[String(p._id)] || 0,
    }))
    res.json({ projects: enriched })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/dev/projects
router.post('/projects', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = sanitizeKey(req.body?.key)
    if (!key) return res.status(400).json({ error: 'Clé invalide (2-8 majuscules, commence par une lettre)' })

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ error: 'Nom requis' })

    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
    const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
      ? req.body.color
      : '#7c5cff'
    const lead = isObjectId(req.body?.lead) ? req.body.lead : null
    const members = Array.isArray(req.body?.members)
      ? Array.from(new Set(req.body.members.filter(isObjectId)))
      : []

    const existing = await DevProject.findOne({ key })
    if (existing) return res.status(409).json({ error: `Une clé "${key}" existe déjà` })

    const githubPatch = parseProjectGithubPatch(req.body?.github)
    const githubConfig =
      githubPatch === undefined || githubPatch === null
        ? null
        : mergeGithubConfig(null, githubPatch)

    const created = await DevProject.create({
      key,
      name,
      description,
      color,
      lead,
      members,
      createdBy: req.user!.id,
      github: githubConfig,
    })

    const populated = await DevProject.findById(created._id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')

    // Notif au lead + chaque membre
    const recipients: string[] = [...(members as string[])]
    if (lead) recipients.push(lead)
    notifyUsers(recipients, {
      type: 'INTERNAL_PROJECT_CREATED',
      title: `Nouveau projet dev`,
      message: `Vous avez été ajouté à "${name}" (${key})`,
      link: `/admin/dev/projects/${created._id}`,
      metadata: { projectId: String(created._id), key },
      excludeUserId: req.user!.id,
    }).catch(() => {})

    res.status(201).json(populated)
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/dev/projects/:id
router.get('/projects/:id', requirePermission(PERMISSIONS.VIEW_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl role')
      .populate('createdBy', 'name email')
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })
    res.json(project)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/dev/projects/:id
router.patch('/projects/:id', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    const oldMembers = project.members.map((id) => String(id))
    const oldLead = project.lead ? String(project.lead) : null

    if (typeof req.body?.name === 'string') project.name = req.body.name.trim().slice(0, 120)
    if (typeof req.body?.description === 'string') project.description = req.body.description.trim().slice(0, 2000)
    if (typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)) project.color = req.body.color
    if (typeof req.body?.status === 'string' && (DEV_PROJECT_STATUSES as readonly string[]).includes(req.body.status)) {
      project.status = req.body.status as typeof project.status
    }
    if (req.body?.lead === null) project.lead = null
    else if (isObjectId(req.body?.lead)) project.lead = new mongoose.Types.ObjectId(req.body.lead)
    if (Array.isArray(req.body?.members)) {
      project.members = Array.from(new Set(req.body.members.filter(isObjectId))).map(
        (id) => new mongoose.Types.ObjectId(id as string)
      )
    }

    const githubPatch = parseProjectGithubPatch(req.body?.github)
    if (githubPatch === null) {
      project.github = null
    } else if (githubPatch && typeof githubPatch === 'object') {
      project.github = mergeGithubConfig(project.github, githubPatch)
    }

    await project.save()
    // Drop any cached code-metrics if the repo configuration changed.
    if (githubPatch !== undefined) invalidateCodeMetricsCache()

    // Notif nouveaux membres / nouveau lead
    const newMembers = project.members.map((id) => String(id))
    const newLead = project.lead ? String(project.lead) : null
    const added = newMembers.filter((id) => !oldMembers.includes(id))
    if (newLead && newLead !== oldLead) added.push(newLead)
    if (added.length > 0) {
      notifyUsers(added, {
        type: 'INTERNAL_PROJECT_CREATED',
        title: `Ajouté au projet dev`,
        message: `"${project.name}" (${project.key})`,
        link: `/admin/dev/projects/${project._id}`,
        metadata: { projectId: String(project._id), key: project.key },
        excludeUserId: req.user!.id,
      }).catch(() => {})
    }
    const populated = await DevProject.findById(project._id)
      .populate('lead', 'name email avatarUrl')
      .populate('members', 'name email avatarUrl')
      .populate('createdBy', 'name email')
    res.json(populated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/dev/projects/:id — supprime aussi les issues / commentaires associés
router.delete('/projects/:id', requirePermission(PERMISSIONS.MANAGE_DEV), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const project = await DevProject.findById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projet introuvable' })

    await DevIssueComment.deleteMany({ project: project._id })
    await DevIssue.deleteMany({ project: project._id })
    await project.deleteOne()

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
