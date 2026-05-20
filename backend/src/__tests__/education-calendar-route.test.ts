import { describe, it, expect, beforeAll, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import { IcsCache } from '../lib/appleCalendar/cache.js'
import { createCalendarRouter } from '../routes/admin/education/calendar.js'

const ICS_SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abc@example.com
SUMMARY:Cours EMA — Marketing
LOCATION:EMA Paris
DTSTART:20251201T140000Z
DTEND:20251201T160000Z
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.com
SUMMARY:Atelier MBWAY — BTS NDRC
DTSTART:20251202T100000Z
DTEND:20251202T120000Z
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR`

function makeApp(ics: string, opts: { url?: string | null } = {}) {
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => ics }))
  const cache = new IcsCache({ ttlMs: 60_000, fetcher })
  const app: Express = express()
  app.use(express.json())
  const router = createCalendarRouter({
    cache,
    getUrl: () => (opts.url === undefined ? 'https://example.com/cal.ics' : opts.url),
  })
  app.use('/api/admin/education/calendar', router)
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status || 500).json({ error: err.message })
  })
  return { app, fetcher, cache }
}

let app: Express

describe('education / calendar route', () => {
  beforeAll(() => {
    const built = makeApp(ICS_SAMPLE)
    app = built.app
  })

  it('returns 503 when no ICS URL is configured', async () => {
    const { app: noUrlApp } = makeApp(ICS_SAMPLE, { url: null })
    const r = await request(noUrlApp)
      .get('/api/admin/education/calendar')
      .query({ from: '2025-11-01', to: '2026-01-01' })
      .expect(503)
    expect(r.body.configured).toBe(false)
  })

  it('returns events from the ICS feed inside the window', async () => {
    const r = await request(app)
      .get('/api/admin/education/calendar')
      .query({ from: '2025-11-01', to: '2026-01-15' })
      .expect(200)
    expect(r.body.configured).toBe(true)
    expect(r.body.source).toBe('Apple Calendar')
    expect(r.body.events.length).toBeGreaterThan(0)
    const titles = r.body.events.map((e: { title: string }) => e.title)
    expect(titles).toContain('Cours EMA — Marketing')

    // School inference works on best-effort basis
    const ema = r.body.events.find((e: { title: string }) => e.title === 'Cours EMA — Marketing')
    expect(ema.school).toBe('EMA')
    const mbway = r.body.events.find((e: { title: string }) => e.title.startsWith('Atelier MBWAY'))
    expect(mbway.school).toBe('MBWAY')
  })

  it('serves a cached body on the second call', async () => {
    const { app: localApp, fetcher: localFetcher } = makeApp(ICS_SAMPLE)
    await request(localApp)
      .get('/api/admin/education/calendar')
      .query({ from: '2025-11-01', to: '2026-01-15' })
      .expect(200)
    const second = await request(localApp)
      .get('/api/admin/education/calendar')
      .query({ from: '2025-11-01', to: '2026-01-15' })
      .expect(200)
    expect(second.body.fromCache).toBe(true)
    expect(localFetcher).toHaveBeenCalledTimes(1)
  })

  it('refetches when ?refresh=1 is passed', async () => {
    const { app: localApp, fetcher: localFetcher } = makeApp(ICS_SAMPLE)
    await request(localApp).get('/api/admin/education/calendar').expect(200)
    await request(localApp).get('/api/admin/education/calendar').query({ refresh: '1' }).expect(200)
    expect(localFetcher).toHaveBeenCalledTimes(2)
  })

  it('POST /refresh invalidates and refetches', async () => {
    const { app: localApp, fetcher: localFetcher } = makeApp(ICS_SAMPLE)
    await request(localApp).get('/api/admin/education/calendar').expect(200)
    const r = await request(localApp).post('/api/admin/education/calendar/refresh').expect(200)
    expect(r.body.configured).toBe(true)
    expect(localFetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed from/to', async () => {
    const r = await request(app)
      .get('/api/admin/education/calendar')
      .query({ from: 'pas-une-date', to: '2026-01-01' })
      .expect(400)
    expect(r.body.error).toMatch(/from/i)
  })

  it('rejects a window larger than 366 days', async () => {
    const r = await request(app)
      .get('/api/admin/education/calendar')
      .query({ from: '2025-01-01', to: '2026-12-31' })
      .expect(400)
    expect(r.body.error).toMatch(/366/)
  })

  it('keeps mounted education calendar router behind super-admin auth', async () => {
    // Sanity check : monter directement le router applicatif (sans bypass middleware)
    // doit renvoyer 401 sans Authorization. On utilise un require dynamique pour
    // éviter le mock auto monté par les autres tests d'éducation.
    const realApp = express()
    realApp.use(express.json())
    const { default: educationRoutes } = await import('../routes/admin/education/index.js')
    realApp.use('/api/admin/education', educationRoutes)
    await request(realApp).get('/api/admin/education/calendar').expect(401)
  })
})
