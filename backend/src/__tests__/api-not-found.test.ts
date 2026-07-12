import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import request from 'supertest'
import apiNotFound from '../middleware/apiNotFound.js'

function buildApp() {
  const app = express()
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.all(['/api', '/api/{*path}'], apiNotFound)
  app.get('{*path}', (_req, res) => res.type('html').send('<!doctype html><html>SPA</html>'))
  return app
}

describe('API unknown-route boundary', () => {
  it.each(['get', 'post', 'patch', 'put', 'delete'] as const)(
    '%s returns a stable JSON 404, never the SPA',
    async (method) => {
      const response = await request(buildApp())[method]('/api/not-a-real-endpoint')

      expect(response.status).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.body).toMatchObject({
        error: 'API endpoint not found',
        code: 'API_NOT_FOUND',
      })
      expect(response.text).not.toContain('<html')
    },
  )

  it('does not mask an API route mounted before it', async () => {
    const response = await request(buildApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('also treats the API namespace root as JSON 404', async () => {
    const response = await request(buildApp()).get('/api')

    expect(response.status).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body.code).toBe('API_NOT_FOUND')
  })

  it('is mounted before the static SPA fallback in the production app', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../index.ts'), 'utf8')
    const handlerIndex = source.indexOf("app.all(['/api', '/api/{*path}'], apiNotFound)")
    expect(handlerIndex).toBeGreaterThan(-1)
    expect(handlerIndex).toBeLessThan(source.indexOf('express.static(publicDir'))
  })
})
