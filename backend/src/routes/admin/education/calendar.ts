import express, { type Request, type Response, type NextFunction } from 'express'
import { parseAndExpand } from '../../../lib/appleCalendar/ics.js'
import { getDefaultCache, type IcsCache } from '../../../lib/appleCalendar/cache.js'
import { inferSchool, inferClassLabel } from '../../../lib/appleCalendar/inference.js'

const router = express.Router()

const SOURCE_LABEL = 'Apple Calendar'

interface SerializedEvent {
  occurrenceId: string
  uid: string
  title: string
  description: string
  location: string
  url: string
  status: string
  start: string
  end: string
  durationMin: number
  allDay: boolean
  source: typeof SOURCE_LABEL
  school: string | null
  classLabel: string | null
}

function getIcsUrl(): string | null {
  const raw =
    process.env.EDUCATION_APPLE_CALENDAR_ICS_URL ||
    process.env.APPLE_CALENDAR_ICS_URL ||
    ''
  return raw.trim() || null
}

function parseRange(req: Request): { from: Date; to: Date } | { error: string } {
  const now = new Date()
  let from = new Date(now.getTime() - 14 * 86_400_000)
  let to = new Date(now.getTime() + 60 * 86_400_000)
  if (req.query.from) {
    const d = new Date(String(req.query.from))
    if (Number.isNaN(d.getTime())) return { error: 'Paramètre "from" invalide (ISO 8601 attendu).' }
    from = d
  }
  if (req.query.to) {
    const d = new Date(String(req.query.to))
    if (Number.isNaN(d.getTime())) return { error: 'Paramètre "to" invalide (ISO 8601 attendu).' }
    to = d
  }
  if (from.getTime() >= to.getTime()) {
    return { error: '"from" doit être strictement antérieur à "to".' }
  }
  // Empêche un range monstrueux qui ferait exploser l'expansion RRULE.
  const maxRangeMs = 366 * 86_400_000
  if (to.getTime() - from.getTime() > maxRangeMs) {
    return { error: 'La fenêtre maximale est de 366 jours.' }
  }
  return { from, to }
}

export function buildEvents(rawIcs: string, from: Date, to: Date): SerializedEvent[] {
  const expanded = parseAndExpand(rawIcs, from, to)
  return expanded.map((ev) => ({
    occurrenceId: ev.occurrenceId,
    uid: ev.uid,
    title: ev.summary || '(Sans titre)',
    description: ev.description,
    location: ev.location,
    url: ev.url,
    status: ev.status,
    start: ev.start,
    end: ev.end,
    durationMin: ev.durationMin,
    allDay: ev.allDay,
    source: SOURCE_LABEL,
    school: inferSchool(ev.summary, ev.location, ev.description),
    classLabel: inferClassLabel(ev.summary, ev.location, ev.description),
  }))
}

export interface CalendarRouterDeps {
  cache?: IcsCache
  getUrl?: () => string | null
}

export function createCalendarRouter(deps: CalendarRouterDeps = {}) {
  const r = express.Router()
  const cache = deps.cache ?? getDefaultCache()
  const getUrl = deps.getUrl ?? getIcsUrl

  // GET / — événements dans une fenêtre (par défaut : J-14 → J+60).
  r.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = getUrl()
      if (!url) {
        return res.status(503).json({
          error:
            "Aucune URL Apple Calendar configurée. Définir EDUCATION_APPLE_CALENDAR_ICS_URL côté serveur.",
          configured: false,
        })
      }
      const range = parseRange(req)
      if ('error' in range) return res.status(400).json({ error: range.error })

      const force = String(req.query.refresh || '') === '1'
      const fetched = await cache.get(url, force)
      const events = buildEvents(fetched.body, range.from, range.to)
      res.json({
        configured: true,
        source: SOURCE_LABEL,
        fetchedAt: fetched.fetchedAt.toISOString(),
        fromCache: fetched.fromCache,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        events,
      })
    } catch (err) {
      next(err)
    }
  })

  // POST /refresh — invalide le cache et refetch immédiatement.
  r.post('/refresh', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const url = getUrl()
      if (!url) {
        return res.status(503).json({
          error:
            "Aucune URL Apple Calendar configurée. Définir EDUCATION_APPLE_CALENDAR_ICS_URL côté serveur.",
          configured: false,
        })
      }
      cache.invalidate()
      const fetched = await cache.get(url, true)
      res.json({
        configured: true,
        fetchedAt: fetched.fetchedAt.toISOString(),
        bytes: fetched.body.length,
      })
    } catch (err) {
      next(err)
    }
  })

  return r
}

router.use('/', createCalendarRouter())

export default router
