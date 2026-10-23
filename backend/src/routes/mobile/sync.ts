import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin, userHasPermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import type { Permission } from '../../types/enums.js'
import Lead from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import Project from '../../models/Project.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import ProjectUpdate from '../../models/ProjectUpdate.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import User from '../../models/User.js'
import Task from '../../models/Task.js'
import MissionBrief from '../../models/MissionBrief.js'
import SyncTombstone, { SYNC_ENTITY_TYPES, SYNC_RETENTION_MS, type SyncEntityType } from '../../models/SyncTombstone.js'
import { leadScopeFilter } from '../../lib/crmScope.js'
import { toTimelineEntry } from '../../lib/interactions.js'

const router = express.Router()
router.use(auth, requireAdmin)
const permissions: Record<SyncEntityType, Permission[]> = {
  leads: [PERMISSIONS.VIEW_CRM],
  interactions: [PERMISSIONS.VIEW_CRM],
  projects: [PERMISSIONS.VIEW_PROJECTS],
  projectPhases: [PERMISSIONS.VIEW_PROJECTS],
  projectUpdates: [PERMISSIONS.VIEW_PROJECTS],
  quotes: [PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.VIEW_BILLING],
}

router.get('/:type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.params.type as SyncEntityType | 'deletions'
    if (type !== 'deletions' && !(SYNC_ENTITY_TYPES as readonly string[]).includes(type)) {
      return res.status(400).json({ error: 'Type de synchronisation inconnu', code: 'INVALID_SYNC_TYPE' })
    }
    const rawLimit = req.query.limit ?? '200'
    const limit = typeof rawLimit === 'string' && /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return res.status(400).json({ error: 'Limite invalide' })
    let cursor: { u: Date; id: string } | undefined
    if (req.query.cursor !== undefined && req.query.cursor !== '') {
      try {
        if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 256 || !/^[\w-]+$/.test(req.query.cursor))
          throw new Error()
        const value = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'))
        if (
          typeof value.u !== 'string' ||
          new Date(value.u).toISOString() !== value.u ||
          !/^[a-f\d]{24}$/i.test(value.id)
        )
          throw new Error()
        cursor = { u: new Date(value.u), id: value.id }
      } catch {
        return res.status(400).json({ error: 'Curseur invalide', code: 'INVALID_CURSOR' })
      }
    }
    if (type === 'deletions' && cursor && cursor.u.getTime() < Date.now() - SYNC_RETENTION_MS) {
      return res.status(410).json({ error: 'Une synchronisation complète est nécessaire', code: 'SYNC_RESET_REQUIRED' })
    }
    const allowed = (
      await Promise.all(
        SYNC_ENTITY_TYPES.map(async (entity) => {
          const grants = await Promise.all(permissions[entity].map((permission) => userHasPermission(req, permission)))
          return grants.some(Boolean) ? entity : null
        }),
      )
    ).filter((entity): entity is SyncEntityType => entity !== null)
    if (type !== 'deletions' && !allowed.includes(type)) return res.status(403).json({ error: 'Accès refusé' })
    const stamp = type === 'deletions' ? 'deletedAt' : 'updatedAt'
    const filter: Record<string, unknown> = { [stamp]: { $lte: new Date(Date.now() - 2000) } }
    if (cursor)
      filter.$or = [
        { [stamp]: { $gt: cursor.u } },
        { [stamp]: cursor.u, _id: { $gt: new mongoose.Types.ObjectId(cursor.id) } },
      ]
    if (type === 'deletions') filter.entityType = { $in: allowed }
    if (type === 'leads') filter.$and = [leadScopeFilter(req)]
    if (type === 'interactions') {
      const leadIds = await Lead.distinct('_id', leadScopeFilter(req))
      const clientFilter =
        req.user!.role === 'SUPER_ADMIN' ? { role: 'CLIENT' } : { role: 'CLIENT', ownerAdminId: req.user!.id }
      const clientIds = (await userHasPermission(req, PERMISSIONS.MANAGE_CLIENTS))
        ? await User.distinct('_id', clientFilter)
        : []
      filter.$and = [
        {
          $or: [
            { subjectType: 'LEAD', subjectId: { $in: leadIds } },
            { subjectType: 'CLIENT', subjectId: { $in: clientIds } },
          ],
        },
      ]
    }
    if (['projects', 'projectPhases', 'projectUpdates'].includes(type) && req.user!.role !== 'SUPER_ADMIN') {
      const [tasks, briefs, assigned] = await Promise.all([
        Task.distinct('project', { assignee: req.user!.id }),
        MissionBrief.distinct('project', { destinataire: req.user!.id }),
        Project.distinct('_id', { assignedTo: req.user!.id }),
      ])
      filter.$and = [{ [type === 'projects' ? '_id' : 'project']: { $in: [...tasks, ...briefs, ...assigned] } }]
    }
    const options = { sort: { [stamp]: 1, _id: 1 } as Record<string, 1>, limit: limit + 1 }
    let items
    switch (type) {
      case 'leads':
        items = await Lead.find(filter, null, options).lean()
        break
      case 'interactions':
        items = await Interaction.find(filter, null, options).populate('author', 'name email').lean()
        break
      case 'projects':
        items = await Project.find(filter, null, options).populate('assignedTo', 'name email').lean()
        break
      case 'projectPhases':
        items = await ProjectPhase.find(filter, null, options)
          .populate('linkedItems', 'title type status isVisible')
          .populate('validation.validatedBy', 'name email')
          .populate('revisionRequests.requestedBy', 'name email')
          .lean()
        break
      case 'projectUpdates':
        items = await ProjectUpdate.find(filter, null, options).lean()
        break
      case 'quotes':
        items = await QuoteProposal.find(filter, null, options).lean()
        break
      case 'deletions':
        items = await SyncTombstone.find(filter, null, options).lean()
        break
    }
    const hasMore = items.length > limit
    items = items.slice(0, limit)
    const last = items.at(-1)
    const date =
      last && (type === 'deletions' ? (last as { deletedAt: Date }).deletedAt : (last as { updatedAt: Date }).updatedAt)
    const nextCursor =
      last && date
        ? Buffer.from(JSON.stringify({ u: date.toISOString(), id: String(last._id) })).toString('base64url')
        : req.query.cursor || null
    const responseItems =
      type === 'interactions'
        ? items.map((item) => {
            const interaction = item as Parameters<typeof toTimelineEntry>[0] & {
              subjectType: string
              subjectId: unknown
            }
            // La timeline ne dit pas à qui l'échange se rattache ; l'app hors ligne en a besoin.
            return {
              ...toTimelineEntry(interaction),
              subjectType: interaction.subjectType,
              subjectId: String(interaction.subjectId),
            }
          })
        : items
    return res.json({ items: responseItems, nextCursor, hasMore })
  } catch (err) {
    return next(err)
  }
})
export default router
