import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { leadScopeFilter } from '../../lib/crmScope.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { requireAdmin, userHasPermission } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import Task from '../../models/Task.js'
import Lead from '../../models/Lead.js'
import { readableProjectIds } from '../../lib/adminProjectAccess.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/search?q=...
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) || '').trim()
    if (!q || q.length < 2) {
      return res.json({ results: [] })
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

    const ids = await readableProjectIds(req.user!)
    const [canViewCrm, canManageClients] = await Promise.all([
      userHasPermission(req, PERMISSIONS.VIEW_CRM),
      userHasPermission(req, PERMISSIONS.MANAGE_CLIENTS),
    ])
    const [projects, clients, tasks, leads] = await Promise.all([
      Project.find({ name: regex, ...(ids === null ? {} : { _id: { $in: ids } }) })
        .limit(5)
        .select('name status priority')
        .lean(),
      canManageClients
        ? User.find({ $or: [{ name: regex }, { email: regex }], role: 'CLIENT' })
            .limit(5)
            .select('name email status')
            .lean()
        : [],
      Task.find({ title: regex, ...(ids === null ? {} : { project: { $in: ids } }) })
        .limit(5)
        .populate('project', 'name')
        .select('title status priority project')
        .lean(),
      canViewCrm
        ? Lead.find({ $and: [leadScopeFilter(req), { $or: [{ company: regex }, { contactName: regex }] }] })
            .limit(5)
            .select('company contactName status leadTemperature')
            .lean()
            .catch(() => [] as any[])
        : [],
    ])

    const results = [
      ...projects.map((p) => ({
        type: 'project',
        id: p._id,
        title: (p as any).name,
        subtitle: `Projet — ${(p as any).status}`,
        link: `/admin/projets/${p._id}`,
      })),
      ...clients.map((c) => ({
        type: 'client',
        id: c._id,
        title: (c as any).name,
        subtitle: `Client — ${(c as any).email}`,
        link: `/admin/comptes-clients/${c._id}`,
      })),
      ...tasks.map((t) => ({
        type: 'task',
        id: t._id,
        title: (t as any).title,
        subtitle: `Tâche — ${(t as any).project?.name || 'Projet'}`,
        link: `/admin/projets/${(t as any).project?._id || (t as any).project}?tab=tasks`,
      })),
      ...leads.map((l) => ({
        type: 'lead',
        id: l._id,
        title: (l as any).company,
        subtitle: `Lead — ${(l as any).contactName || ''}`,
        link: `/admin/crm/leads/${l._id}`,
      })),
    ]

    return res.json({ results })
  } catch (err) {
    return next(err)
  }
})

export default router
