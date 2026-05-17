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
import crmRoutes from './crm.js'
import projectsRoutes from './projects.js'
import templatesRoutes from './templates.js'
import briefsRoutes from './briefs.js'
import billingRoutes from './billing.js'
import documentsRoutes from './documents.js'

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
 * Spécification OpenAPI 3 statique de l'API agent. Pas d'auth — la spec
 * est publique pour faciliter l'intégration. Sera remplie au fil des lots.
 */
router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Venio Agent API',
      version: '1.0.0-draft',
      description:
        "API REST de pilotage de Venio par des agents externes (Kuro, intégrations). " +
        "Auth : Bearer vno_pat_* avec scopes. Voir docs/api-agent.md.",
    },
    servers: [{ url: '/api/v1/agent' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'vno_pat',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'code'],
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            requestId: { type: 'string' },
            details: { type: 'object', additionalProperties: true },
          },
        },
        Paginated: {
          type: 'object',
          required: ['items', 'page', 'pageSize', 'total'],
          properties: {
            items: { type: 'array', items: {} },
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1 },
            total: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    'x-agent-scopes': AGENT_SCOPES,
    paths: {
      '/ping': {
        get: {
          summary: 'Vérifie l\'authentification et renvoie l\'identité du token courant',
          security: [{ BearerAuth: [] }],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      token: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          prefix: { type: 'string' },
                          scopes: { type: 'array', items: { type: 'string' } },
                        },
                      },
                      serverTime: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '401': {
              description: 'Token invalide',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
    },
  })
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
