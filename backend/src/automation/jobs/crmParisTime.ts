// ─────────────────────────────────────────────────────────────
// Heure de Paris pour les tâches planifiées du CRM.
//
// Le serveur tourne en UTC : « 08:00 » ou « aujourd'hui » lus avec getHours()
// / toDateString() décalent les envois d'une ou deux heures selon la saison et
// changent de jour à 01:00 ou 02:00 heure de Paris. Tout passe ici par Intl
// (fuseau Europe/Paris, heure d'été comprise), sans dépendance.
// ─────────────────────────────────────────────────────────────

export const CRM_TIME_ZONE = 'Europe/Paris'

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CRM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const pad = (n: number) => String(n).padStart(2, '0')

export interface ParisParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = dimanche … 6 = samedi, comme Date#getDay. */
  weekday: number
  /** Minutes écoulées depuis minuit, heure de Paris. */
  minutesOfDay: number
  /** Jour calendaire à Paris, `YYYY-MM-DD`. */
  dateKey: string
}

export function parisParts(date: Date = new Date()): ParisParts {
  const parts: Record<string, string> = {}
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutesOfDay: hour * 60 + minute,
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
  }
}

/** Jour calendaire à Paris (`YYYY-MM-DD`). */
export function parisDateKey(date: Date = new Date()): string {
  return parisParts(date).dateKey
}

/** Semaine ISO du jour de Paris (`YYYY-Www`). */
export function parisWeekKey(date: Date = new Date()): string {
  const { year, month, day } = parisParts(date)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

/** `"HH:MM"` → minutes depuis minuit ; `fallback` si la valeur est illisible. */
export function parseHHMM(value: string | undefined | null, fallback: string): number {
  const read = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    return h < 24 && min < 60 ? h * 60 + min : null
  }
  return read(value ?? '') ?? read(fallback) ?? 0
}

/** Décalage (minutes) de Paris sur UTC à l'instant donné : +60 en hiver, +120 en été. */
function parisOffsetMinutes(instant: number): number {
  const p = parisParts(new Date(instant))
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return Math.round((wall - Math.floor(instant / 60000) * 60000) / 60000)
}

/** Instant correspondant à l'heure murale de Paris donnée (le jour du passage à l'heure d'été, 02:30 devient 03:30). */
export function parisWallTimeToDate(year: number, month: number, day: number, minutesOfDay: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay)
  let t = guess - parisOffsetMinutes(guess) * 60000
  const second = parisOffsetMinutes(t)
  t = guess - second * 60000
  return new Date(t)
}

/**
 * Traduit une heure de Paris (`"09:00"`, ou `"monday:08:00"`) en
 * planification lue par `automation/scheduler.ts`, qui compare l'heure LOCALE
 * du serveur. Recalculée à chaque passage du planificateur (getter
 * `schedule` des définitions CRM) : le résultat suit l'heure d'été et reste
 * juste quel que soit le fuseau du serveur.
 */
export function serverScheduleForParis(spec: string, now: Date = new Date()): string {
  const m = /^(?:(sunday|monday|tuesday|wednesday|thursday|friday|saturday):)?(\d{2}:\d{2})$/i.exec(spec)
  if (!m) return spec
  const today = parisParts(now)
  const at = parisWallTimeToDate(today.year, today.month, today.day, parseHHMM(m[2], '00:00'))
  const hhmm = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  if (!m[1]) return hhmm
  // Jour visé à Paris ; le jour local du serveur peut différer près de minuit.
  const targetDay = DAY_NAMES.indexOf(m[1].toLowerCase())
  const shift = at.getDay() - today.weekday
  return `${DAY_NAMES[(targetDay + shift + 7) % 7]}:${hhmm}`
}
