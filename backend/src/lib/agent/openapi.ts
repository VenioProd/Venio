import type { Router } from 'express'
import { AGENT_SCOPES, ADMIN_WILDCARD_SCOPE } from './scopes.js'

/**
 * Génère dynamiquement la spec OpenAPI 3.1 de l'API agent à partir de
 * l'introspection du router Express. Évite de maintenir manuellement
 * un fichier JSON gigantesque qui dérive du code.
 *
 * Couvre :
 *   - paths        : toutes les routes (method, path) extraites du router
 *                    et de ses sous-routeurs montés via router.use('/', ...)
 *   - components   : Error, Paginated, Token
 *   - security     : BearerAuth (sauf openapi.json et ping/openapi public)
 *   - x-agent-scopes : catalogue complet pour discovery
 *
 * Limitations :
 *   - Les schémas de body et response détaillés ne sont PAS générés
 *     (un dump générique suffit pour la discovery Kuro et un LLM s'en sort
 *     bien avec les types courants).
 *   - Pour des schemas typés stricts, ajouter manuellement dans une future
 *     version.
 */

export interface ExtractedRoute {
  method: string // GET / POST / etc.
  path: string // ex "/clients/:id"
}

/**
 * Parcourt récursivement la stack Express pour extraire toutes les routes
 * définies. Fonctionne pour les routes directes ET les sous-routeurs montés.
 */
export function extractRoutes(router: Router, basePath = ''): ExtractedRoute[] {
  const out: ExtractedRoute[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (router as unknown as { stack: any[] }).stack || []
  for (const layer of stack) {
    if (layer.route) {
      const path = basePath + layer.route.path
      const methods: Record<string, boolean> = layer.route.methods || {}
      for (const m of Object.keys(methods)) {
        if (m === '_all') continue
        out.push({ method: m.toUpperCase(), path })
      }
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Sous-routeur monté avec router.use(prefix, subRouter).
      // Le préfixe est encodé dans layer.regexp. On essaie de reverse-engineer
      // un éventuel préfixe simple ; si la regex correspond juste à "/" on
      // garde basePath inchangé.
      const subBase = extractPrefixFromRegexp(layer.regexp) || ''
      out.push(...extractRoutes(layer.handle as Router, basePath + subBase))
    }
  }
  return out
}

/**
 * Tente d'extraire un préfixe lisible d'une regex Express. Pour le cas
 * `router.use('/', subRouter)`, retourne '' (pas de préfixe à ajouter).
 * Pour `router.use('/foo', subRouter)`, on parse la source de la regex.
 */
function extractPrefixFromRegexp(regexp: RegExp | undefined): string {
  if (!regexp) return ''
  // Heuristique : on extrait les littéraux entre les meta-chars.
  // Pour '/' → /^\/?(?=\/|$)/i → retourne ''
  // Pour '/foo' → /^\/foo\/?(?=\/|$)/i → retourne '/foo'
  const source = regexp.source
  const match = source.match(/^\^\\?\/?(.+?)\\\/\?\(\?=\\\/\|\$\)/)
  if (!match) return ''
  return '/' + match[1]!.replace(/\\\//g, '/').replace(/\\/g, '')
}

/**
 * Convertit un path Express ("/clients/:id") en path OpenAPI ("/clients/{id}").
 */
export function expressToOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}')
}

/**
 * Endpoints publics (sans auth). Tout le reste exige Bearer + un scope.
 */
const PUBLIC_PATHS = new Set(['/openapi.json'])

/**
 * Construit la spec OpenAPI 3.1 à partir des routes extraites.
 *
 * Format minimal mais utile pour discovery par Kuro :
 *   - chaque path/method a un operationId + summary + security
 *   - les path params sont déclarés
 *   - réponses : 200/201/204 OK générique + 400/401/403/404/429/500 par défaut
 */
export function buildOpenApiSpec(routes: ExtractedRoute[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const r of routes) {
    const openApiPath = expressToOpenApiPath(r.path)
    if (!paths[openApiPath]) paths[openApiPath] = {}

    const method = r.method.toLowerCase()
    const operationId = makeOperationId(method, r.path)
    const isPublic = PUBLIC_PATHS.has(r.path)
    const isMutation = ['post', 'patch', 'put', 'delete'].includes(method)

    const pathParams = Array.from(r.path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)).map((m) => ({
      name: m[1],
      in: 'path' as const,
      required: true,
      schema: { type: 'string' },
    }))

    paths[openApiPath]![method] = {
      operationId,
      summary: makeSummary(method, r.path),
      ...(pathParams.length > 0 ? { parameters: pathParams } : {}),
      ...(isPublic ? {} : { security: [{ BearerAuth: [] }] }),
      ...(isMutation && !isPublic
        ? {
            requestBody: {
              required: false,
              content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
            },
          }
        : {}),
      responses: {
        '200': {
          description: 'Succès',
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
        },
        ...(isMutation
          ? {
              '201': { description: 'Créé', content: { 'application/json': { schema: { type: 'object' } } } },
              '400': {
                description: 'Validation',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
              },
              '409': {
                description: 'Conflit (idempotency / contrainte)',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
              },
            }
          : {}),
        ...(isPublic
          ? {}
          : {
              '401': {
                description: 'Token invalide',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
              },
              '403': {
                description: 'Scope insuffisant',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
              },
              '429': {
                description: 'Rate limit dépassé',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
              },
            }),
        '500': {
          description: 'Erreur serveur',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Venio Agent API',
      version: '1.0.0',
      description:
        "API REST de pilotage de Venio par des agents externes (Kuro, intégrations tierces). " +
        "Auth Bearer + scopes. Cf. docs/api-agent.md pour la doc complète.",
    },
    servers: [{ url: '/api/v1/agent' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'vno_pat_<32 base62>' },
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
            items: { type: 'array', items: { type: 'object' } },
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1 },
            total: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    'x-agent-scopes': AGENT_SCOPES,
    'x-admin-wildcard-scope': ADMIN_WILDCARD_SCOPE,
    paths,
  }
}

function makeOperationId(method: string, path: string): string {
  const cleanPath = path
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, 'By$1')
    .replace(/\/_meta\//g, '/Meta/')
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^_/, '')
  return `${method.toLowerCase()}_${cleanPath || 'root'}`
}

function makeSummary(method: string, path: string): string {
  const m = method.toUpperCase()
  return `${m} ${path}`
}
