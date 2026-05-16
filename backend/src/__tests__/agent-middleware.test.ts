import { describe, it, expect } from 'vitest'
import express, { type Request, type Response, type NextFunction } from 'express'
import request from 'supertest'
import { requireScope } from '../routes/agent/_middleware/auth.js'
import { agentErrorHandler, requestIdMiddleware } from '../routes/agent/_middleware/errors.js'

/**
 * Tests d'intégration des middlewares qui ne dépendent pas de la base.
 *
 * Pour les tests de auth/idempotency/audit qui appellent Mongo, on ajoutera
 * mongodb-memory-server dans un lot ultérieur. Ici on couvre :
 *   - requireScope : autorise / refuse selon les scopes attachés
 *   - agentErrorHandler : formate les erreurs en JSON standardisé
 *   - requestIdMiddleware : assigne un req.requestId
 */

function buildApp(scopes: string[] | null) {
  const app = express()
  app.use(express.json())
  app.use(requestIdMiddleware)

  // Stub : injecte un agentToken comme si l'auth avait réussi
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (scopes !== null) {
      req.agentToken = {
        id: '507f1f77bcf86cd799439011',
        name: 'test-token',
        prefix: 'vno_pat_test',
        scopes,
        rateLimitPerMin: 120,
      }
    }
    next()
  })

  return app
}

describe('Agent / requireScope middleware', () => {
  it('allows when token has the required scope', async () => {
    const app = buildApp(['read:crm'])
    app.get('/test', requireScope('read:crm'), (_req, res) => {
      res.json({ ok: true })
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('allows when token has admin:* even without specific scope', async () => {
    const app = buildApp(['admin:*'])
    app.get('/test', requireScope('manage:backup'), (_req, res) => {
      res.json({ ok: true })
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/test')
    expect(res.status).toBe(200)
  })

  it('returns 403 INSUFFICIENT_SCOPE when missing a scope', async () => {
    const app = buildApp(['read:crm'])
    app.get('/test', requireScope('write:crm'), (_req, res) => {
      res.json({ ok: true })
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/test')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
    expect(res.body.details?.required).toEqual(['write:crm'])
    expect(res.body.details?.missing).toEqual(['write:crm'])
    expect(res.body.requestId).toMatch(/^req_/)
  })

  it('returns 403 when multiple required scopes and at least one is missing', async () => {
    const app = buildApp(['read:crm'])
    app.get('/test', requireScope('read:crm', 'write:crm', 'read:projects'), (_req, res) => {
      res.json({ ok: true })
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/test')
    expect(res.status).toBe(403)
    expect(res.body.details?.missing.sort()).toEqual(['read:projects', 'write:crm'])
  })

  it('returns 401 when no token attached (bug d\'ordre de middleware)', async () => {
    const app = buildApp(null) // pas de token injecté
    app.get('/test', requireScope('read:crm'), (_req, res) => {
      res.json({ ok: true })
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/test')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MISSING_TOKEN')
  })
})

describe('Agent / requestIdMiddleware', () => {
  it('assigns a unique requestId on each request', async () => {
    const seen: string[] = []
    const app = express()
    app.use(requestIdMiddleware)
    app.get('/x', (req, res) => {
      seen.push(req.requestId || '')
      res.json({ requestId: req.requestId })
    })

    const r1 = await request(app).get('/x')
    const r2 = await request(app).get('/x')
    expect(r1.body.requestId).toMatch(/^req_/)
    expect(r2.body.requestId).toMatch(/^req_/)
    expect(r1.body.requestId).not.toBe(r2.body.requestId)
    expect(seen).toHaveLength(2)
  })
})

describe('Agent / agentErrorHandler', () => {
  it('formats AgentApiError with status, code, details', async () => {
    const { AgentApiError } = await import('../routes/agent/_middleware/errors.js')
    const app = express()
    app.use(requestIdMiddleware)
    app.get('/boom', (_req, _res, next) => {
      next(new AgentApiError(422, 'CUSTOM_CODE', 'détail', { hint: 'hello' }))
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/boom')
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({
      error: 'détail',
      code: 'CUSTOM_CODE',
      details: { hint: 'hello' },
    })
    expect(res.body.requestId).toMatch(/^req_/)
  })

  it('hides 500 error messages from the response', async () => {
    const app = express()
    app.use(requestIdMiddleware)
    app.get('/boom', (_req, _res, next) => {
      next(new Error('database password is hunter2'))
    })
    app.use(agentErrorHandler)

    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Erreur interne du serveur')
    expect(res.body.code).toBe('INTERNAL')
    // Le message sensible ne fuite pas
    expect(JSON.stringify(res.body)).not.toContain('hunter2')
  })
})
