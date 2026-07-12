import { describe, it, expect, beforeEach, vi } from 'vitest'
import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'

/**
 * Tests des routes admin /api/admin/agent-tokens/* — version "pure" sans Mongo.
 *
 * On mock le modèle AgentToken et les helpers d'audit pour isoler la
 * logique du handler (validation, format de réponse, statuts HTTP). Les
 * interactions DB elles-mêmes seront couvertes au prochain lot avec
 * mongodb-memory-server.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockTokenStore: Record<string, unknown> = {}

vi.mock('../models/AgentToken.js', () => {
  function mkTokenDoc(id: string, data: Record<string, unknown>) {
    return {
      _id: id,
      ...data,
      save: vi.fn(async function (this: Record<string, unknown>) {
        mockTokenStore[id] = { ...this }
      }),
    }
  }

  const find = (filter: Record<string, unknown> = {}) => {
    const sort = () => ({
      populate: () => ({
        populate: () => ({
          lean: async () => {
            return Object.values(mockTokenStore).filter((t) => {
              const token = t as { status: string }
              return !filter.status || token.status === filter.status
            })
          },
        }),
      }),
    })
    return { sort }
  }

  const findById = (id: string) => {
    const populate1 = () => ({
      populate: () => ({
        lean: async () => mockTokenStore[id] ?? null,
      }),
      lean: async () => mockTokenStore[id] ?? null,
    })
    return {
      populate: populate1,
      then: (cb: (v: unknown) => unknown) => {
        // Pour await AgentToken.findById(id) sans populate
        const doc = mockTokenStore[id]
        return Promise.resolve(doc ? mkTokenDoc(id, doc as Record<string, unknown>) : null).then(cb)
      },
    }
  }

  const create = vi.fn(async (data: Record<string, unknown>) => {
    const id = `tok_${Math.random().toString(36).slice(2, 10)}`
    const doc = {
      _id: id,
      status: 'ACTIVE',
      lastUsedAt: null,
      lastUsedIp: '',
      lastUsedUserAgent: '',
      totalRequests: 0,
      totalMutations: 0,
      revokedAt: null,
      revokedBy: null,
      notes: '',
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }
    mockTokenStore[id] = doc
    return mkTokenDoc(id, doc)
  })

  return { default: { find, findById, create } }
})

vi.mock('../lib/audit/auditHelpers.js', () => ({
  recordAudit: vi.fn(async () => {}),
  buildActorFromReq: vi.fn(() => ({ type: 'USER', ip: '', userAgent: '' })),
  shallowDiff: vi.fn(() => []),
}))

// Stub User.create pour la création du User AGENT (nouvelle feature)
vi.mock('../models/User.js', () => {
  const create = vi.fn(async (data: Record<string, unknown>) => {
    const id = `usr_${Math.random().toString(36).slice(2, 10)}`
    return {
      _id: id,
      ...data,
      agentTokenId: null,
      save: vi.fn(async function () {}),
    }
  })
  return { default: { create } }
})

// Stub ensureGeneralChannel pour éviter une connexion Mongo réelle
vi.mock('../services/internalMessaging.js', () => ({
  ensureGeneralChannel: vi.fn(async () => {}),
}))

// Stub d'auth : injecte un req.user admin
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: '507f1f77bcf86cd799439011',
      role: 'SUPER_ADMIN',
      email: 'admin@venio.paris',
      name: 'Admin Test',
      mfaVerifiedAt: Date.now(),
    }
    next()
  },
}))

vi.mock('../middleware/role.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAnyPermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

// ── Build de l'app pour les tests ───────────────────────────────────────────

async function buildApp() {
  const { default: adminAgentTokenRoutes } = await import('../routes/admin/agentTokens.js')
  const app = express()
  app.use(express.json())
  // Les tests de handler gardent la confirmation valide afin d'isoler les
  // validations métier. Le contrat du garde-fou est couvert en intégration.
  app.use((req, _res, next) => {
    if (req.method === 'POST' && req.path.endsWith('/revoke')) req.headers['x-venio-confirm'] = 'AGENT_TOKEN_REVOKE'
    else if (req.method === 'POST') req.headers['x-venio-confirm'] = 'AGENT_TOKEN_CREATE'
    else if (req.method === 'PATCH') req.headers['x-venio-confirm'] = 'AGENT_TOKEN_UPDATE'
    next()
  })
  app.use('/api/admin/agent-tokens', adminAgentTokenRoutes)
  return app
}

beforeEach(() => {
  for (const k of Object.keys(mockTokenStore)) delete mockTokenStore[k]
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Admin agent-tokens / GET /scopes', () => {
  it('returns the scope catalogue', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/admin/agent-tokens/scopes')
    expect(res.status).toBe(200)
    expect(res.body.scopes).toContain('read:crm')
    expect(res.body.scopes).toContain('admin:*')
    expect(res.body.adminWildcard).toBe('admin:*')
  })
})

describe('Admin agent-tokens / POST /', () => {
  it('creates a token and reveals the plainSecret once', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'Kuro prod', scopes: ['read:crm', 'write:projects'] })

    expect(res.status).toBe(201)
    expect(res.body.plainSecret).toMatch(/^vno_pat_[A-Za-z0-9]{32}$/)
    expect(res.body.token).toBeTruthy()
    expect(res.body.token.name).toBe('Kuro prod')
    expect(res.body.token.scopes).toEqual(['read:crm', 'write:projects'])
    expect(res.body.token.rateLimitPerMin).toBe(120)
    expect(res.body.token.status).toBe('ACTIVE')
    expect(res.body.warning).toContain('Copiez-le maintenant')
  })

  it('rejects an empty scopes array', async () => {
    const app = await buildApp()
    const res = await request(app).post('/api/admin/agent-tokens').send({ name: 'Bad', scopes: [] })
    expect(res.status).toBe(400)
  })

  it('rejects unknown scopes', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'Bad', scopes: ['read:crm', 'bogus:scope', 'write:accounting'] })
    expect(res.status).toBe(400)
    expect(res.body.unknownScopes.sort()).toEqual(['bogus:scope', 'write:accounting'])
  })

  it('rejects missing name', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .send({ scopes: ['read:crm'] })
    expect(res.status).toBe(400)
  })

  it('accepts a custom rateLimitPerMin', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'Throttled', scopes: ['read:crm'], rateLimitPerMin: 30 })
    expect(res.status).toBe(201)
    expect(res.body.token.rateLimitPerMin).toBe(30)
  })

  it('rejects rateLimitPerMin out of bounds', async () => {
    const app = await buildApp()
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'TooMuch', scopes: ['read:crm'], rateLimitPerMin: 99999 })
    expect(res.status).toBe(400)
  })
})

describe('Admin agent-tokens / GET / and /:id', () => {
  it('lists active tokens by default', async () => {
    const app = await buildApp()
    await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'A', scopes: ['read:crm'] })
    await request(app)
      .post('/api/admin/agent-tokens')
      .send({ name: 'B', scopes: ['read:projects'] })

    const res = await request(app).get('/api/admin/agent-tokens')
    expect(res.status).toBe(200)
    expect(res.body.tokens).toHaveLength(2)
  })

  it('rejects a non-Mongo ID on detail', async () => {
    const app = await buildApp()
    const res = await request(app).get('/api/admin/agent-tokens/not-an-id')
    expect(res.status).toBe(400)
  })
})
