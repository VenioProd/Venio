import express, { type Request, type Response } from 'express'
import agentAuth, { requireScope } from './_middleware/auth.js'
import agentRateLimit from './_middleware/rateLimit.js'
import agentIdempotency from './_middleware/idempotency.js'
import agentAudit from './_middleware/audit.js'
import {
  requestIdMiddleware,
  agentErrorHandler,
} from './_middleware/errors.js'
import { AGENT_SCOPES } from '../../lib/agent/scopes.js'
import { buildOpenApiSpec, extractRoutes } from '../../lib/agent/openapi.js'
import crmRoutes from './crm.js'
import projectsRoutes from './projects.js'
import templatesRoutes from './templates.js'
import briefsRoutes from './briefs.js'
import billingRoutes from './billing.js'
import documentsRoutes from './documents.js'
import tasksRoutes from './tasks.js'
import ticketsRoutes from './tickets.js'
import messagesRoutes from './messages.js'
import notificationsRoutes from './notifications.js'
import calendarRoutes from './calendar.js'
import accountingRoutes from './accounting.js'
import resourcesRoutes from './resources.js'
import gestionRoutes from './gestion.js'
import qualiopiRoutes from './qualiopi.js'
import internsRoutes from './interns.js'
import arrowRoutes from './arrow.js'
import analyticsRoutes from './analytics.js'
import auditRoutes from './audit.js'
import automationsRoutes from './automations.js'
import backupRoutes from './backup.js'
import usersRoutes from './users.js'
import messagingRoutes from './messaging.js'

/**
 * Router racine de l'API agent — monté sur /api/v1/agent.
 *
 * Pipeline appliqué à toutes les routes (sauf l'endpoint OpenAPI public) :
 *   1. requestIdMiddleware   → req.requestId pour corrélation
 *   2. agentAuth             → Bearer parse + lookup + attach req.agentToken
 *   3. agentRateLimit        → quota par token (X-RateLimit-* headers)
 *   4. agentIdempotency      → check/store (POST/PATCH/PUT/DELETE)
 *   5. agentAudit            → log post-response (mutations 2xx)
 *
 * En fin de chaîne : agentErrorHandler qui formate les erreurs en JSON
 * standardisé { error, code, requestId, details? }.
 *
 * Sous-routeurs par module métier ajoutés dans les lots suivants.
 */

const router = express.Router()

// 0. requestId pour TOUTE requête, y compris l'OpenAPI public.
router.use(requestIdMiddleware)

// ── Endpoints publics (avant agentAuth) ─────────────────────────────────────

/**
 * GET /api/v1/agent/openapi.json
 * Spec OpenAPI 3.1 générée dynamiquement par introspection du routeur.
 * Publique (pas d'auth). Cache la spec après le 1er calcul.
 */
let cachedSpec: Record<string, unknown> | null = null
router.get('/openapi.json', (_req: Request, res: Response) => {
  if (!cachedSpec) {
    cachedSpec = buildOpenApiSpec(extractRoutes(router))
  }
  res.json(cachedSpec)
})

// ── Pipeline authentifié ────────────────────────────────────────────────────

router.use(agentAuth)
router.use(agentRateLimit)
router.use(agentIdempotency)
router.use(agentAudit)

/**
 * GET /api/v1/agent/ping
 * Endpoint de vérification : renvoie l'identité du token courant.
 * Ne requiert aucun scope spécifique — tout token actif peut y accéder.
 */
router.get('/ping', (req: Request, res: Response) => {
  res.json({
    ok: true,
    token: req.agentToken
      ? {
          id: req.agentToken.id,
          name: req.agentToken.name,
          prefix: req.agentToken.prefix,
          scopes: req.agentToken.scopes,
        }
      : null,
    serverTime: new Date().toISOString(),
  })
})

/**
 * GET /api/v1/agent/whoami — alias d'identification plus explicite, déjà
 * gated par scope (utile pour vérifier qu'un token a bien un read minimum).
 */
router.get('/whoami', requireScope('read:users'), (req: Request, res: Response) => {
  res.json({
    token: req.agentToken,
    serverTime: new Date().toISOString(),
  })
})

// ── Sous-routeurs par module métier ─────────────────────────────────────────
router.use('/', crmRoutes)
router.use('/', projectsRoutes)
router.use('/', templatesRoutes)
router.use('/', briefsRoutes)
router.use('/', billingRoutes)
router.use('/', documentsRoutes)
router.use('/', tasksRoutes)
router.use('/', ticketsRoutes)
router.use('/', messagesRoutes)
router.use('/', notificationsRoutes)
router.use('/', calendarRoutes)
router.use('/', accountingRoutes)
router.use('/', resourcesRoutes)
router.use('/', gestionRoutes)
router.use('/', qualiopiRoutes)
router.use('/', internsRoutes)
router.use('/', arrowRoutes)
router.use('/', analyticsRoutes)
router.use('/', auditRoutes)
router.use('/', automationsRoutes)
router.use('/', backupRoutes)
router.use('/', usersRoutes)
router.use('/messaging', messagingRoutes)

// 404 dans le scope agent (avant l'error handler) — sinon Express le passe
// au handler global de index.ts, qui formate différemment.
router.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Endpoint /api/v1/agent${req.path} introuvable`,
    code: 'NOT_FOUND',
    requestId: req.requestId,
  })
})

// Error handler terminal de l'API agent (format { error, code, requestId, details }).
router.use(agentErrorHandler)

export default router
