import express, { type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import Task from '../../models/Task.js'
import User from '../../models/User.js'
import MissionBrief from '../../models/MissionBrief.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// GET /api/admin/gestion/tasks-all?projectId=
router.get('/tasks-all', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.query
    const filter: Record<string, unknown> = {}
    if (projectId) filter.project = projectId

    // Non-SUPER_ADMIN : seulement les tâches assignées à l'utilisateur
    if (user.role !== 'SUPER_ADMIN') {
      filter.assignee = user.id
    }

    const tasks = await Task.find(filter)
      .populate('assignee', 'name email')
      .populate('createdBy', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 })

    res.json({ tasks })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/gestion/kpi?period=week|month|year&userId=
router.get('/kpi', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response) => {
  try {
    const { period, userId } = req.query
    const now = new Date()
    let since: Date

    if (period === 'week') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      since = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (period === 'year') {
      since = new Date(now.getFullYear(), 0, 1)
    } else {
      since = new Date(0)
    }

    const filter: Record<string, unknown> = { updatedAt: { $gte: since } }
    if (userId) filter.assignee = userId

    // Non-SUPER_ADMIN : seulement ses tâches
    const currentUser = (req as any).user
    if (currentUser.role !== 'SUPER_ADMIN' && !userId) {
      filter.assignee = currentUser.id
    }

    const allTasks = await Task.find(filter)
      .populate('assignee', 'name email')
      .populate('project', 'name')

    // Stats globales
    const tasksByStatus: Record<string, number> = { A_FAIRE: 0, EN_COURS: 0, EN_REVIEW: 0, TERMINE: 0 }
    const tasksByPriority: Record<string, number> = { BASSE: 0, NORMALE: 0, HAUTE: 0, URGENTE: 0 }
    allTasks.forEach((t) => {
      tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1
      tasksByPriority[t.priority] = (tasksByPriority[t.priority] || 0) + 1
    })

    // Per-person performance
    const personMap: Record<string, {
      name: string
      total: number
      completed: number
      inProgress: number
      overdue: number
      onTime: number
      late: number
      totalDurationHours: number
      completedWithDuration: number
    }> = {}

    allTasks.forEach((t) => {
      const assignee = t.assignee as any
      if (!assignee) return
      const id = assignee._id?.toString() || assignee.toString()
      const name = assignee.name || 'Inconnu'

      if (!personMap[id]) {
        personMap[id] = { name, total: 0, completed: 0, inProgress: 0, overdue: 0, onTime: 0, late: 0, totalDurationHours: 0, completedWithDuration: 0 }
      }
      const p = personMap[id]
      p.total++

      if (t.status === 'TERMINE') {
        p.completed++
        // Deadline compliance
        if (t.dueDate) {
          const completedAt = new Date(t.updatedAt)
          if (completedAt <= new Date(t.dueDate)) {
            p.onTime++
          } else {
            p.late++
          }
        }
        // Treatment duration
        const created = new Date(t.createdAt).getTime()
        const updated = new Date(t.updatedAt).getTime()
        const durationH = (updated - created) / (1000 * 60 * 60)
        if (durationH > 0) {
          p.totalDurationHours += durationH
          p.completedWithDuration++
        }
      } else if (t.status === 'EN_COURS' || t.status === 'EN_REVIEW') {
        p.inProgress++
      }

      // Overdue check
      if (t.dueDate && t.status !== 'TERMINE' && new Date(t.dueDate) < now) {
        p.overdue++
      }
    })

    const tasksByPerson = Object.entries(personMap).map(([id, p]) => ({
      userId: id,
      name: p.name,
      total: p.total,
      completed: p.completed,
      inProgress: p.inProgress,
      overdue: p.overdue,
      complianceRate: (p.onTime + p.late) > 0 ? Math.round((p.onTime / (p.onTime + p.late)) * 100) : null,
      avgTreatmentHours: p.completedWithDuration > 0
        ? Math.round((p.totalDurationHours / p.completedWithDuration) * 10) / 10
        : null,
    }))

    // Global stats
    const totalTasks = allTasks.length
    const completedTasks = tasksByStatus.TERMINE
    const overdueTasks = allTasks.filter((t) => t.dueDate && t.status !== 'TERMINE' && new Date(t.dueDate) < now).length

    // Admin list for filters
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'PDG', 'ADMIN', 'RH', 'COMMERCIAL', 'VIEWER', 'STAGIAIRE'] } }).select('_id name email')

    // Brief stats — missions attribuees par super admin
    const briefFilter: Record<string, unknown> = { createdAt: { $gte: since } }
    const allBriefs = await MissionBrief.find(briefFilter)
      .populate('createdBy', 'name')
      .populate('destinataire', 'name')

    const briefsByCreator: Record<string, { name: string; total: number; byStatus: Record<string, number> }> = {}
    const briefsByDestinataire: Record<string, { name: string; received: number; completed: number }> = {}

    allBriefs.forEach((b) => {
      // Par createur (super admin)
      const creator = b.createdBy as any
      const cId = creator?._id?.toString() || ''
      const cName = creator?.name || 'Inconnu'
      if (!briefsByCreator[cId]) {
        briefsByCreator[cId] = { name: cName, total: 0, byStatus: { A_FAIRE: 0, EN_COURS: 0, EN_REVIEW: 0, VALIDE: 0, LIVRE: 0, NON_VALIDE: 0, A_AMELIORER: 0 } }
      }
      briefsByCreator[cId].total++
      briefsByCreator[cId].byStatus[b.statut] = (briefsByCreator[cId].byStatus[b.statut] || 0) + 1

      // Par destinataire
      const dest = b.destinataire as any
      const dId = dest?._id?.toString() || ''
      const dName = dest?.name || 'Inconnu'
      if (!briefsByDestinataire[dId]) {
        briefsByDestinataire[dId] = { name: dName, received: 0, completed: 0 }
      }
      briefsByDestinataire[dId].received++
      if (b.statut === 'VALIDE' || b.statut === 'LIVRE') {
        briefsByDestinataire[dId].completed++
      }
    })

    const briefStats = {
      totalBriefs: allBriefs.length,
      byCreator: Object.entries(briefsByCreator).map(([id, v]) => ({ userId: id, ...v })),
      byDestinataire: Object.entries(briefsByDestinataire).map(([id, v]) => ({ userId: id, ...v })),
    }

    res.json({
      totalTasks,
      completedTasks,
      overdueTasks,
      tasksByStatus,
      tasksByPriority,
      tasksByPerson,
      admins,
      briefStats,
    })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
