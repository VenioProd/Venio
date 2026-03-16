import express, { Request, Response, NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import Project from '../../../models/Project.js'
import ProjectItem from '../../../models/ProjectItem.js'
import ProjectSection from '../../../models/ProjectSection.js'
import ClientActivity from '../../../models/ClientActivity.js'
import { ok, error, ensureClient, computeProjectProgress } from './helpers.js'

const router = express.Router()

router.get('/:id/activities', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const activities = await ClientActivity.find({ clientId: client._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('actorId', 'name email role')
      .lean()

    return ok(res, { activities })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/projects', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const includeArchived = req.query.archived === 'true'
    const projectFilter: Record<string, unknown> = { client: client._id }
    if (!includeArchived) {
      projectFilter.$or = [{ isArchived: false }, { isArchived: { $exists: false } }]
    }

    const projects = await Project.find(projectFilter).sort({ updatedAt: -1 }).lean()
    const projectIds = projects.map((project) => project._id)
    const items = await ProjectItem.find({ project: { $in: projectIds } }).select('project type status').lean()

    const grouped = new Map<string, any[]>()
    for (const item of items) {
      const key = item.project.toString()
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(item)
    }

    const projectsWithMetrics = projects.map((project) => {
      const metricsItems = grouped.get(project._id.toString()) || []
      return {
        ...project,
        progressPercent: computeProjectProgress(project, metricsItems),
        deliverableCount: metricsItems.filter((item) => item.type === 'LIVRABLE').length,
      }
    })

    return ok(res, { projects: projectsWithMetrics })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/progress', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const projects = await Project.find({
      client: client._id,
      $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
    }).lean()

    if (projects.length === 0) {
      return ok(res, {
        progressPercent: 0,
        completedMilestones: 0,
        totalMilestones: 0,
        delayedDeadlines: 0,
        nextDeadlines: [],
      })
    }

    const projectIds = projects.map((project) => project._id)
    const items = await ProjectItem.find({ project: { $in: projectIds } }).select('project type status').lean()

    const groupedItems = new Map<string, any[]>()
    for (const item of items) {
      const key = item.project.toString()
      if (!groupedItems.has(key)) groupedItems.set(key, [])
      groupedItems.get(key)!.push(item)
    }

    const now = new Date()
    let progressTotal = 0
    let totalMilestones = 0
    let completedMilestones = 0
    let delayedDeadlines = 0
    const nextDeadlines: Array<{ projectId: unknown; projectName: string; label: string; dueAt: Date }> = []

    for (const project of projects) {
      const projectItems = groupedItems.get(project._id.toString()) || []
      progressTotal += computeProjectProgress(project, projectItems)

      const milestones = projectItems.filter((item) => item.type === 'LIVRABLE')
      totalMilestones += milestones.length
      completedMilestones += milestones.filter((item) => ['TERMINE', 'VALIDE'].includes(item.status)).length

      for (const deadline of (project as any).deadlines || []) {
        if (!deadline?.dueAt) continue
        const dueDate = new Date(deadline.dueAt)
        if (Number.isNaN(dueDate.getTime())) continue

        if (dueDate < now && (project as any).status !== 'TERMINE') {
          delayedDeadlines += 1
          continue
        }

        if (dueDate >= now) {
          nextDeadlines.push({
            projectId: project._id,
            projectName: (project as any).name,
            label: deadline.label || 'Jalon',
            dueAt: dueDate,
          })
        }
      }
    }

    nextDeadlines.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

    return ok(res, {
      progressPercent: Math.round(progressTotal / projects.length),
      completedMilestones,
      totalMilestones,
      delayedDeadlines,
      nextDeadlines: nextDeadlines.slice(0, 5),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/deliverables', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const projects = await Project.find({ client: client._id }).select('_id name').lean()
    const projectIds = projects.map((project) => project._id)
    const projectMap = new Map(projects.map((project) => [project._id.toString(), project]))

    const sections = await ProjectSection.find({ project: { $in: projectIds } }).select('_id title').lean()
    const sectionMap = new Map(sections.map((section) => [section._id.toString(), (section as any).title]))

    const items = await ProjectItem.find({
      project: { $in: projectIds },
      type: { $in: ['LIVRABLE', 'MAQUETTE', 'DOCUMENTATION', 'LIEN', 'NOTE', 'AUTRE'] },
    })
      .sort({ updatedAt: -1 })
      .lean()

    const deliverables = items.map((item) => ({
      _id: item._id,
      projectId: item.project,
      projectName: (projectMap.get(item.project.toString()) as any)?.name || 'Projet',
      section: item.section ? sectionMap.get(item.section.toString()) || '' : '',
      itemType: item.type,
      title: item.title,
      updatedAt: item.updatedAt,
      visibleToClient: item.isVisible,
      isDownloadable: item.isDownloadable,
      firstViewedAt: item.viewedAt || null,
      downloadedAt: item.downloadedAt || null,
    }))

    return ok(res, { deliverables })
  } catch (err) {
    return next(err)
  }
})

export default router
