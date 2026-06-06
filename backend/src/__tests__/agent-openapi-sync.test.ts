import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createTestApp, getAgentRouter } from './helpers/agentTestApp.js'
import { extractRoutes, expressToOpenApiPath, buildOpenApiSpec } from '../lib/agent/openapi.js'
import { AGENT_SCOPES, ADMIN_WILDCARD_SCOPE } from '../lib/agent/scopes.js'

/**
 * Test de synchronisation OpenAPI spec ↔ router Express.
 *
 * Garantit que :
 *   1. Toutes les routes définies dans le router agent apparaissent dans la
 *      spec OpenAPI servie sur /api/v1/agent/openapi.json
 *   2. Aucune route fantôme dans la spec qui n'existerait pas dans le router
 *   3. La spec contient les éléments structurels obligatoires (servers, scopes,
 *      components.schemas.Error/Paginated, securitySchemes)
 *   4. Tous les modules métier livrés (lots 3 à 9) ont au moins une route
 *      référencée dans la spec
 *
 * Ce test est notre filet de sécurité contre la dérive doc ↔ code.
 */

let app: Express
let spec: Record<string, unknown>

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
  const res = await request(app).get('/api/v1/agent/openapi.json')
  spec = res.body as Record<string, unknown>
})

afterAll(async () => {
  await teardownMongo()
})

describe('Agent OpenAPI / structure', () => {
  it('responds 200 without auth', async () => {
    const res = await request(app).get('/api/v1/agent/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toMatch(/^3\./)
  })

  it('declares Venio Agent API metadata', () => {
    expect((spec.info as Record<string, string>).title).toContain('Venio')
    expect((spec.info as Record<string, string>).version).toBeTruthy()
  })

  it('declares BearerAuth security scheme', () => {
    const schemes = (spec.components as Record<string, Record<string, unknown>>)?.securitySchemes
    expect(schemes?.BearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' })
  })

  it('exposes Error and Paginated schemas', () => {
    const schemas = (spec.components as Record<string, Record<string, unknown>>)?.schemas
    expect(schemas).toHaveProperty('Error')
    expect(schemas).toHaveProperty('Paginated')
  })

  it('lists the full scope catalogue in x-agent-scopes', () => {
    expect(spec['x-agent-scopes']).toEqual(AGENT_SCOPES)
    expect(spec['x-admin-wildcard-scope']).toBe(ADMIN_WILDCARD_SCOPE)
  })
})

describe('Agent OpenAPI / router ↔ spec sync', () => {
  it('every router route is documented in the OpenAPI paths', async () => {
    const router = await getAgentRouter()
    const routes = extractRoutes(router)
    expect(routes.length).toBeGreaterThan(40) // smoke : on s'attend à beaucoup de routes

    const paths = spec.paths as Record<string, Record<string, unknown>>
    const undocumented: string[] = []
    for (const r of routes) {
      const openApiPath = expressToOpenApiPath(r.path)
      const method = r.method.toLowerCase()
      if (!paths[openApiPath] || !paths[openApiPath]![method]) {
        undocumented.push(`${r.method} ${r.path}`)
      }
    }
    expect(undocumented).toEqual([])
  })

  it('every documented path/method exists in the router', async () => {
    const router = await getAgentRouter()
    const routes = extractRoutes(router)
    const routerSet = new Set(routes.map((r) => `${r.method} ${expressToOpenApiPath(r.path)}`))

    const paths = spec.paths as Record<string, Record<string, unknown>>
    const phantom: string[] = []
    for (const [p, methods] of Object.entries(paths)) {
      for (const m of Object.keys(methods)) {
        const key = `${m.toUpperCase()} ${p}`
        if (!routerSet.has(key)) phantom.push(key)
      }
    }
    expect(phantom).toEqual([])
  })
})

describe('Agent OpenAPI / coverage by module', () => {
  it('covers every business module delivered (lots 3-9)', () => {
    const paths = Object.keys((spec.paths as Record<string, unknown>) || {})
    const required: string[] = [
      // Fondations
      '/ping',
      '/whoami',
      '/openapi.json',
      // CRM (lot 3)
      '/clients',
      '/leads',
      // Projets (lot 4)
      '/projects',
      '/templates',
      '/briefs',
      // Billing + Documents (lot 5)
      '/billing',
      '/documents',
      // Tasks / Tickets / Messages / Notif / Calendar (lot 6)
      '/tasks',
      '/tickets',
      '/notifications',
      '/calendar/events',
      // Comptabilité (lot 7)
      '/accounting/entries',
      '/accounting/dashboard',
      // Modules secondaires (lot 8)
      '/resources',
      '/tool-access',
      '/internal-projects',
      '/qualiopi/questionnaires',
      '/interns',
      '/arrow/schools',
      '/analytics/snapshot',
      // Sensibles (lot 9)
      '/audit/log',
      '/automations',
      '/backup',
      '/users',
    ]
    const missing = required.filter((p) => !paths.includes(p))
    expect(missing).toEqual([])
  })
})

describe('Agent OpenAPI / buildOpenApiSpec unit tests', () => {
  it('converts Express path params to OpenAPI format', () => {
    expect(expressToOpenApiPath('/clients/:id')).toBe('/clients/{id}')
    expect(expressToOpenApiPath('/clients/:id/contacts/:contactId')).toBe('/clients/{id}/contacts/{contactId}')
    expect(expressToOpenApiPath('/no-params')).toBe('/no-params')
  })

  it('builds a minimal spec from an empty route list', () => {
    const s = buildOpenApiSpec([])
    expect(s.openapi).toMatch(/^3\./)
    expect(s.paths).toEqual({})
  })

  it('encodes path params as parameters[]', () => {
    const s = buildOpenApiSpec([{ method: 'GET', path: '/foo/:bar' }]) as Record<string, unknown>
    const paths = s.paths as Record<string, Record<string, Record<string, unknown>>>
    const op = paths['/foo/{bar}']!.get
    expect(op?.parameters as Array<{ name: string; in: string }>).toEqual([
      { name: 'bar', in: 'path', required: true, schema: { type: 'string' } },
    ])
  })

  it('marks /openapi.json as public (no security)', () => {
    const s = buildOpenApiSpec([{ method: 'GET', path: '/openapi.json' }]) as Record<string, unknown>
    const paths = s.paths as Record<string, Record<string, Record<string, unknown>>>
    const op = paths['/openapi.json']!.get
    expect(op?.security).toEqual([])
  })

  it('marks other paths as Bearer-protected', () => {
    const s = buildOpenApiSpec([{ method: 'GET', path: '/clients' }]) as Record<string, unknown>
    const paths = s.paths as Record<string, Record<string, Record<string, unknown>>>
    const op = paths['/clients']!.get
    expect(op?.security).toEqual([{ BearerAuth: [] }])
  })

  it('mutations include 400 and 409 responses', () => {
    const s = buildOpenApiSpec([{ method: 'POST', path: '/clients' }]) as Record<string, unknown>
    const paths = s.paths as Record<string, Record<string, Record<string, unknown>>>
    const op = paths['/clients']!.post
    const responses = op?.responses as Record<string, unknown>
    expect(responses['400']).toBeDefined()
    expect(responses['409']).toBeDefined()
    expect(responses['201']).toBeDefined()
  })

  it('preserves mount prefixes such as /messaging in generated paths', async () => {
    const paths = spec.paths as Record<string, unknown>
    expect(paths['/messaging/conversations']).toBeDefined()
    expect(paths['/conversations']).toBeUndefined()
  })
})
