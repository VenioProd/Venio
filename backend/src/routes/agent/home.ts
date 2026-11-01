import express, { type Request, type Response, type NextFunction } from 'express'
import { ADMIN_WILDCARD_SCOPE, hasAllScopes } from '../../lib/agent/scopes.js'
import { buildHomeQueue, clampQueueLimit, type QueueKind } from '../../lib/home/queue.js'
import { respondError } from './_middleware/errors.js'

/**
 * GET /home/queue — file d'actions de l'accueil admin, vue globale.
 *
 * Pas de scope dédié : chaque source est filtrée par le scope de lecture qui
 * la couvre déjà. Il suffit d'en détenir un pour appeler la route ; les
 * sources non couvertes sont simplement absentes (et listées hors `kinds`).
 *
 *   tâches en retard  → read:tasks
 *   tickets           → read:tickets
 *   demandes clients  → read:projects
 *   relances CRM      → read:crm
 *   revue dev         → read:dev
 *   décisions         → admin:* (aucune route agent n'expose les décisions)
 *
 * Un token n'est rattaché à aucun utilisateur : la vue n'est pas filtrée par
 * assigné et `actions` est toujours vide (les mutations passent par les
 * routes agent de chaque module).
 */

const router = express.Router()

export const HOME_QUEUE_SCOPES: Record<QueueKind, string> = {
  task: 'read:tasks',
  ticket: 'read:tickets',
  request: 'read:projects',
  crm: 'read:crm',
  dev: 'read:dev',
  decision: ADMIN_WILDCARD_SCOPE,
}

router.get('/home/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const granted = req.agentToken?.scopes ?? []
    const kinds = new Set<QueueKind>()
    for (const [kind, scope] of Object.entries(HOME_QUEUE_SCOPES) as [QueueKind, string][]) {
      if (hasAllScopes(granted, [scope])) kinds.add(kind)
    }
    if (kinds.size === 0) {
      const anyOf = Object.values(HOME_QUEUE_SCOPES).filter((s) => s !== ADMIN_WILDCARD_SCOPE)
      return respondError(res, 403, 'INSUFFICIENT_SCOPE', 'Au moins un scope de lecture requis pour cette ressource', {
        required: anyOf,
        anyOf: true,
        granted,
        missing: anyOf,
      })
    }

    const queue = await buildHomeQueue({
      kinds,
      userId: null,
      projectIds: null,
      ownTicketsOnly: false,
      leadFilter: {},
      canDecide: false,
      canManageTasks: false,
      limit: clampQueueLimit(req.query.limit),
    })
    return res.json(queue)
  } catch (err) {
    return next(err)
  }
})

export default router
