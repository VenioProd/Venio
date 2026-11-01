/** Logique pure du calendrier de l'accueil : dates locales, placement, normalisation des sources. */

export const CAL_KINDS = ['event', 'task', 'session', 'decision', 'project'] as const
export type CalKind = (typeof CAL_KINDS)[number]
export type CalView = 'day' | 'week' | 'month'

/** Teinte de chaque source (classe `ck-*` de Accueil.css). */
export const CAL_TONE: Record<CalKind, string> = {
  event: 'sky',
  task: 'amber',
  session: 'mint',
  decision: 'rose',
  project: 'vio',
}

export interface CalEvent {
  id: string
  kind: CalKind
  /** Titre brut de la source. Vide quand `titleKey` fournit le libellé. */
  title: string
  /** Libellé à composer côté interface (début / fin de projet). */
  titleKey?: 'projectStart' | 'projectEnd'
  /** Jour local, YYYY-MM-DD. */
  date: string
  /** Minutes depuis minuit ; absent = à la journée. */
  start?: number
  end?: number
  sub?: string | null
  location?: string | null
  who?: string | null
  link?: string | null
  late?: boolean
}

export const pad = (n: number) => (n < 10 ? '0' : '') + n
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
export const hm = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`

export function weekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Cases de la grille mensuelle, lundi en tête, 5 ou 6 semaines. */
export function monthCells(anchor: Date): Date[] {
  const first = startOfMonth(anchor)
  const start = startOfWeek(first)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i)
    // Sixième semaine seulement si elle commence encore dans le mois.
    if (i === 35 && d.getMonth() !== first.getMonth()) break
    cells.push(d)
  }
  return cells
}

/** Fenêtre chargée pour un mois : couvre la grille mensuelle et toute semaine qui la chevauche. */
export function fetchWindow(anchor: Date): { start: Date; end: Date } {
  const first = startOfMonth(anchor)
  return { start: addDays(startOfWeek(first), -7), end: addDays(first, 49) }
}

export interface Placement {
  lane: number
  lanes: number
}

/** Répartit les créneaux qui se chevauchent en colonnes (même algorithme que la maquette). */
export function layoutTimed(events: CalEvent[]): Map<string, Placement> {
  const out = new Map<string, Placement>()
  const list = events
    .filter((e) => e.start !== undefined)
    .map((e) => ({ id: e.id, s: e.start!, e: e.end ?? e.start! + 30 }))
    .sort((a, b) => a.s - b.s || b.e - a.e)
  let cluster: { id: string; s: number; e: number; lane: number }[] = []
  let clusterEnd = 0
  const flush = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0)
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes })
    cluster = []
  }
  for (const ev of list) {
    if (cluster.length && ev.s >= clusterEnd) {
      flush()
      clusterEnd = 0
    }
    let lane = 0
    while (cluster.some((c) => c.lane === lane && c.e > ev.s)) lane++
    cluster.push({ ...ev, lane })
    clusterEnd = Math.max(clusterEnd, ev.e)
  }
  flush()
  return out
}

/** Plage horaire affichée : 8 h – 19 h, élargie si un créneau en sort. */
export function hourRange(events: CalEvent[]): { from: number; to: number } {
  let from = 8
  let to = 19
  for (const e of events) {
    if (e.start === undefined) continue
    from = Math.min(from, Math.floor(e.start / 60))
    to = Math.max(to, Math.ceil((e.end ?? e.start + 30) / 60))
  }
  return { from: Math.max(0, from), to: Math.min(24, to) }
}

export function sortDay(events: CalEvent[]): { allDay: CalEvent[]; timed: CalEvent[] } {
  return {
    allDay: events.filter((e) => e.start === undefined),
    timed: events.filter((e) => e.start !== undefined).sort((a, b) => a.start! - b.start!),
  }
}

// ─── Normalisation des sources ──────────────────────────────────────────────

export interface ApiCalendarEvent {
  id: string
  type: 'task' | 'deadline' | 'project_start' | 'project_end' | 'decision'
  title: string
  date: string
  projectId: string | null
  projectName: string
  metadata?: { status?: string; priority?: string }
}

const DONE_TASK = ['TERMINE', 'VALIDE']

export function fromCalendarApi(events: ApiCalendarEvent[], today: string): CalEvent[] {
  return events.map((e) => {
    const project = e.projectId ? `/admin/projets/${e.projectId}` : null
    switch (e.type) {
      case 'task':
        return {
          id: e.id,
          kind: 'task' as const,
          title: e.title,
          date: e.date,
          sub: e.projectName || null,
          location: e.projectName || null,
          link: project,
          late: e.date < today && !DONE_TASK.includes(e.metadata?.status ?? ''),
        }
      case 'decision':
        return {
          id: e.id,
          kind: 'decision' as const,
          title: e.title,
          date: e.date,
          link: '/admin/decisions',
          late: e.date < today,
        }
      case 'project_start':
      case 'project_end':
        return {
          id: e.id,
          kind: 'project' as const,
          title: e.projectName,
          titleKey: e.type === 'project_start' ? ('projectStart' as const) : ('projectEnd' as const),
          date: e.date,
          location: e.projectName || null,
          link: project,
        }
      default:
        return {
          id: e.id,
          kind: 'project' as const,
          title: e.title,
          date: e.date,
          sub: e.projectName || null,
          location: e.projectName || null,
          link: project,
        }
    }
  })
}

export interface ApiSession {
  _id: string
  title: string
  date: string
  durationMin?: number
  location?: string
  status?: string
  classId?: { name?: string } | string | null
}

export function fromSessions(sessions: ApiSession[]): CalEvent[] {
  return sessions
    .filter((s) => s.status !== 'ANNULEE')
    .map((s) => {
      const start = new Date(s.date)
      const m = minutesOf(start)
      const className = s.classId && typeof s.classId === 'object' ? s.classId.name || null : null
      return {
        id: `session_${s._id}`,
        kind: 'session' as const,
        title: s.title,
        date: isoDay(start),
        start: m,
        end: Math.min(24 * 60, m + (s.durationMin ?? 120)),
        sub: className,
        location: s.location || null,
        who: className,
        link: '/admin/formation/pedagogie',
      }
    })
}

export interface ApiIcsEvent {
  occurrenceId: string
  title: string
  location?: string
  start: string
  end?: string
  durationMin?: number
  allDay?: boolean
}

export function fromIcs(events: ApiIcsEvent[]): CalEvent[] {
  return events.map((e) => {
    const start = new Date(e.start)
    const base = {
      id: `ics_${e.occurrenceId}`,
      kind: 'event' as const,
      title: e.title,
      location: e.location || null,
      link: null,
    }
    if (e.allDay) return { ...base, date: e.start.slice(0, 10) }
    const m = minutesOf(start)
    const end = e.end ? new Date(e.end) : null
    const sameDay = end && isoDay(end) === isoDay(start)
    return {
      ...base,
      date: isoDay(start),
      start: m,
      end: sameDay ? Math.max(m + 15, minutesOf(end!)) : Math.min(24 * 60, m + (e.durationMin ?? 60)),
    }
  })
}
