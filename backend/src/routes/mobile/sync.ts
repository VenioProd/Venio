import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin, userHasPermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import type { Permission } from '../../types/enums.js'
import Lead from '../../models/Lead.js'
import Interaction from '../../models/Interaction.js'
import Project from '../../models/Project.js'
import ProjectItem from '../../models/ProjectItem.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import ProjectUpdate from '../../models/ProjectUpdate.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import User from '../../models/User.js'
import { accessibleProjectIds, readableProjectIds } from '../../lib/adminProjectAccess.js'
import SyncTombstone, { SYNC_ENTITY_TYPES, SYNC_RETENTION_MS, type SyncEntityType } from '../../models/SyncTombstone.js'
import { leadScopeFilter } from '../../lib/crmScope.js'
import { toTimelineEntry } from '../../lib/interactions.js'
import { loadQuotePortfolio } from '../../lib/quotePortfolio.js'

const router = express.Router()
router.use(auth, requireAdmin)
const permissions: Record<SyncEntityType, Permission[]> = {
  leads: [PERMISSIONS.VIEW_CRM],
  interactions: [PERMISSIONS.VIEW_CRM],
  projects: [PERMISSIONS.VIEW_PROJECTS],
  projectPhases: [PERMISSIONS.VIEW_PHASES],
  projectUpdates: [PERMISSIONS.VIEW_PROJECTS],
  projectDocuments: [PERMISSIONS.VIEW_CONTENT],
  quotes: [PERMISSIONS.MANAGE_QUOTES, PERMISSIONS.VIEW_BILLING],
}

type QuotableItem = { assignedTo?: unknown; client?: unknown; clientAccountId?: unknown }

// L'app n'a pas à refaire la règle de portefeuille : le serveur dit, pour
// chaque projet et chaque lead, si l'utilisateur peut y créer un devis.
async function withCanQuote(req: Request, type: 'projects' | 'leads', items: QuotableItem[]) {
  // `assignedTo` est peuplé sur les projets : on compare son identifiant.
  const refs = items.map((item) => ({
    ...item,
    assignedTo: (item.assignedTo as { _id?: unknown } | null)?._id ?? item.assignedTo,
  }))
  const portfolio = await loadQuotePortfolio(req, type === 'projects' ? { projects: refs } : { leads: refs })
  return items.map((item, index) => ({
    ...item,
    canQuote: type === 'projects' ? portfolio.canQuoteProject(refs[index]!) : portfolio.canQuoteLead(refs[index]!),
  }))
}

// `client` reste un identifiant : le portefeuille de devis le compare à des ids.
// Le nom à afficher voyage à part, dans `clientName`.
async function withClientNames<T extends { client?: unknown }>(projects: T[]) {
  const ids = [...new Set(projects.map((project) => String(project.client ?? '')).filter(Boolean))]
  const clients = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select('name companyName')
        .lean()
    : []
  const names = new Map(clients.map((client) => [String(client._id), client.companyName || client.name]))
  return projects.map((project) => ({ ...project, clientName: names.get(String(project.client ?? '')) ?? '' }))
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
    if (['projects', 'projectPhases', 'projectUpdates', 'projectDocuments'].includes(type)) {
      const projectIds = await (req.user!.role === 'COMMERCIAL'
        ? readableProjectIds(req.user!)
        : accessibleProjectIds(req.user!))
      if (projectIds !== null) filter.$and = [{ [type === 'projects' ? '_id' : 'project']: { $in: projectIds } }]
    }
    if (type === 'quotes') {
      const ids = await readableProjectIds(req.user!)
      if (ids !== null) filter.$and = [{ $or: [{ project: null }, { project: { $in: ids } }] }]
    }
    if (type === 'projectDocuments') filter['file.storagePath'] = { $exists: true, $ne: '' }
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
        items = await withClientNames(
          await Project.find(filter, null, options).populate('assignedTo', 'name email').lean(),
        )
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
      case 'projectDocuments':
        items = (
          await ProjectItem.find(filter, null, options)
            .select(
              '_id project section type title description file.originalName file.mimeType file.size isVisible createdBy createdAt updatedAt',
            )
            .populate('createdBy', 'name')
            .lean()
        ).map((item) => ({
          ...item,
          downloadUrl: `/api/admin/projects/${item.project}/items/${item._id}/download`,
        }))
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
        : type === 'projects' || type === 'leads'
          ? await withCanQuote(req, type, items as QuotableItem[])
          : items
    return res.json({ items: responseItems, nextCursor, hasMore })
  } catch (err) {
    return next(err)
  }
})
export default router
