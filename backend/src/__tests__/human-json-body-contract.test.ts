import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { jsonBodyErrorHandler } from '../middleware/jsonBodyErrors.js'

function buildHumanApiApp() {
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.post('/api/admin/example', (_req, res) => res.json({ ok: true }))
  app.use(jsonBodyErrorHandler)
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status || 500).json({ error: err.message || 'Server error' })
  })
  return app
}

describe('Human API JSON body contract', () => {
  it('returns a stable machine code for malformed JSON', async () => {
    const response = await request(buildHumanApiApp())
      .post('/api/admin/example')
      .set('Content-Type', 'application/json')
      .send('{')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'JSON malformé',
      code: 'MALFORMED_JSON',
    })
  })

  it('returns a stable machine code when the 2 MiB JSON limit is exceeded', async () => {
    const response = await request(buildHumanApiApp())
      .post('/api/admin/example')
      .set('Content-Type', 'application/json')
      .send(`"${'x'.repeat(2 * 1024 * 1024)}"`)

    expect(response.status).toBe(413)
    expect(response.body).toEqual({
      error: 'Payload trop volumineux',
      code: 'PAYLOAD_TOO_LARGE',
    })
  })

  it('is installed after Sentry and before the generic error handler in the production app', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../index.ts'), 'utf8')
    const handlerIndex = source.indexOf('app.use(jsonBodyErrorHandler)')

    expect(handlerIndex).toBeGreaterThan(source.indexOf('Sentry.setupExpressErrorHandler(app)'))
    expect(handlerIndex).toBeLessThan(source.indexOf('// Global error handler'))
  })
})
