import express, { type Request, type Response, type NextFunction } from 'express'
import { parseAndExpand } from '../../../lib/appleCalendar/ics.js'
import { getDefaultCache, type IcsCache } from '../../../lib/appleCalendar/cache.js'
import { inferSchool, inferClassLabel } from '../../../lib/appleCalendar/inference.js'
import {
  matchEventsToClasses,
  type ClassCandidate,
  type MatchedClass,
} from '../../../lib/appleCalendar/matching.js'
import EducationClass from '../../../models/education/EducationClass.js'

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

interface UpcomingEvent extends SerializedEvent {
  match: MatchedClass | null
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
  loadClasses?: (req: Request) => Promise<ClassCandidate[]>
}

async function defaultLoadClasses(req: Request): Promise<ClassCandidate[]> {
  if (!req.user?.id) return []
  const rows = await EducationClass.find({
    owner: req.user.id,
    deletedAt: null,
    status: { $ne: 'ARCHIVE' },
  })
    .select('_id name school level program color tags notes')
    .lean()
  return rows.map((c) => ({
    _id: String(c._id),
    name: c.name || '',
    school: c.school || '',
    level: c.level || '',
    program: c.program || '',
    color: c.color || '#22C55E',
    tags: c.tags || [],
    notes: c.notes || '',
  }))
}

function parseUpcomingDays(req: Request): { days: number } | { error: string } {
  const raw = req.query.days
  if (raw === undefined || raw === null || raw === '') return { days: 14 }
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return { error: 'Paramètre "days" invalide.' }
  if (n > 60) return { error: 'Paramètre "days" plafonné à 60.' }
  return { days: Math.floor(n) }
}

export function createCalendarRouter(deps: CalendarRouterDeps = {}) {
  const r = express.Router()
  const cache = deps.cache ?? getDefaultCache()
  const getUrl = deps.getUrl ?? getIcsUrl
  const loadClasses = deps.loadClasses ?? defaultLoadClasses

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

  // GET /upcoming — événements à venir (J -> J+days) rattachés aux classes
  // du cockpit quand possible. Strictement lecture seule.
  r.get('/upcoming', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const url = getUrl()
      if (!url) {
        return res.status(503).json({
          error:
            "Aucune URL Apple Calendar configurée. Définir EDUCATION_APPLE_CALENDAR_ICS_URL côté serveur.",
          configured: false,
          events: [],
        })
      }
      const parsed = parseUpcomingDays(req)
      if ('error' in parsed) return res.status(400).json({ error: parsed.error })

      const now = new Date()
      // On démarre à minuit pour inclure les cours d'aujourd'hui déjà commencés.
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const to = new Date(from.getTime() + parsed.days * 86_400_000)

      const fetched = await cache.get(url)
      const baseEvents = buildEvents(fetched.body, from, to)
      const classes = await loadClasses(req)
      const inputs = baseEvents.map((ev) => ({
        title: ev.title,
        location: ev.location,
        description: ev.description,
        inferredSchool: ev.school,
        inferredClassLabel: ev.classLabel,
      }))
      const matches = matchEventsToClasses(inputs, classes)
      const annotated: UpcomingEvent[] = baseEvents.map((ev, idx) => ({
        ...ev,
        match: matches[idx].match,
      }))

      res.json({
        configured: true,
        source: SOURCE_LABEL,
        fetchedAt: fetched.fetchedAt.toISOString(),
        fromCache: fetched.fromCache,
        from: from.toISOString(),
        to: to.toISOString(),
        days: parsed.days,
        events: annotated,
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
