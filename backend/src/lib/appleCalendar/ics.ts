/**
 * Parseur ICS (RFC 5545) ciblé pour les flux iCloud / Apple Calendar.
 *
 * Couvre :
 *  - dépliage des lignes (continuation par espace/tab)
 *  - paramètres (TZID, VALUE=DATE…) et échappements de valeurs (\\, \n, \,, \;)
 *  - VEVENT : SUMMARY, DESCRIPTION, LOCATION, URL, UID, DTSTART, DTEND,
 *    DURATION, RRULE, EXDATE, STATUS
 *  - dates UTC (suffixe Z), dates locales avec TZID (interprétées via Intl)
 *    et dates « flottantes » (interprétées en UTC pour rester déterministe)
 *  - expansion RRULE : FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT,
 *    UNTIL, BYDAY (pour WEEKLY)
 *
 * Volontairement minimaliste : pas de dépendance externe, pas de support
 * exhaustif de toutes les règles RRULE rares. Suffisant pour un calendrier
 * pédagogique « lecture seule » (lectures hebdomadaires, examens, etc.).
 */

export type IcsDuration = { hours: number; minutes: number }

export interface ParsedIcsEvent {
  uid: string
  summary: string
  description: string
  location: string
  url: string
  status: string
  start: Date
  end: Date
  allDay: boolean
  rrule: string | null
  exdates: string[]
  tzid: string | null
}

export interface ExpandedEvent {
  uid: string
  summary: string
  description: string
  location: string
  url: string
  status: string
  /** ISO 8601 UTC */
  start: string
  /** ISO 8601 UTC */
  end: string
  /** Durée en minutes */
  durationMin: number
  allDay: boolean
  /** Identifiant stable : uid + occurrence */
  occurrenceId: string
}

// ───────────────────── Pré-traitement et tokenisation ─────────────────────

/**
 * Replie les lignes continuées (RFC 5545 §3.1 : toute ligne commençant par un
 * espace ou une tabulation prolonge la précédente).
 */
export function unfoldLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out.filter((l) => l.length > 0)
}

export interface ParsedProperty {
  name: string
  params: Record<string, string>
  value: string
}

/**
 * Découpe une ligne ICS en {nom, paramètres, valeur}.
 * Exemple : "DTSTART;TZID=Europe/Paris:20251201T140000" →
 *   { name: 'DTSTART', params: { TZID: 'Europe/Paris' }, value: '20251201T140000' }
 */
export function parseProperty(line: string): ParsedProperty | null {
  const colon = findValueColon(line)
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const segments = splitParams(left)
  const name = (segments.shift() || '').toUpperCase()
  const params: Record<string, string> = {}
  for (const seg of segments) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    params[seg.slice(0, eq).toUpperCase()] = stripQuotes(seg.slice(eq + 1))
  }
  return { name, params, value }
}

function stripQuotes(v: string): string {
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1)
  return v
}

/**
 * Localise le « : » qui sépare paramètres et valeur, sans confondre avec un
 * « : » présent dans la valeur d'un paramètre entre guillemets.
 */
function findValueColon(line: string): number {
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuote = !inQuote
    else if (ch === ':' && !inQuote) return i
  }
  return -1
}

function splitParams(s: string): string[] {
  const parts: string[] = []
  let buf = ''
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      inQuote = !inQuote
      buf += ch
    } else if (ch === ';' && !inQuote) {
      parts.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.length) parts.push(buf)
  return parts
}

/**
 * Décode les échappements ICS dans une valeur texte.
 */
export function unescapeValue(v: string): string {
  return v
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// ─────────────────────── Dates avec / sans fuseau ─────────────────────────

const DATETIME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/

/**
 * Convertit une valeur DTSTART/DTEND en Date UTC.
 *
 *  - "20251201T140000Z" → UTC
 *  - "20251201T140000" + TZID=Europe/Paris → interprété dans ce TZ
 *  - "20251201T140000" sans TZID → interprété en UTC (déterministe quel
 *    que soit le fuseau du serveur)
 *  - "20251201" (VALUE=DATE) → minuit UTC, allDay=true
 */
export function parseIcsDate(value: string, tzid: string | null): { date: Date; allDay: boolean } {
  const date = DATE_RE.exec(value)
  if (date) {
    const [, y, mo, d] = date
    return {
      date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))),
      allDay: true,
    }
  }
  const dt = DATETIME_RE.exec(value)
  if (!dt) {
    throw new Error(`Format de date ICS invalide : ${value}`)
  }
  const [, y, mo, d, h, mi, s, z] = dt
  const yy = Number(y)
  const mm = Number(mo)
  const dd = Number(d)
  const hh = Number(h)
  const mn = Number(mi)
  const ss = Number(s)
  if (z === 'Z') {
    return { date: new Date(Date.UTC(yy, mm - 1, dd, hh, mn, ss)), allDay: false }
  }
  if (tzid) {
    return { date: localTzToUtc(yy, mm, dd, hh, mn, ss, tzid), allDay: false }
  }
  return { date: new Date(Date.UTC(yy, mm - 1, dd, hh, mn, ss)), allDay: false }
}

/**
 * Convertit un wall-clock dans un fuseau IANA en Date UTC réelle.
 * Utilise Intl.DateTimeFormat — fonctionne pour tous les fuseaux supportés
 * par Node, ce qui inclut Europe/Paris (le seul cas concret prévu ici).
 */
export function localTzToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tzid: string,
): Date {
  // 1. On suppose dans un premier temps que le wall-clock est en UTC.
  let candidate = Date.UTC(year, month - 1, day, hour, minute, second)
  // 2. On regarde quel offset le fuseau a à cet instant…
  let offset = tzOffsetMinutes(tzid, new Date(candidate))
  candidate -= offset * 60_000
  // 3. …et on refine une fois pour absorber un éventuel passage DST.
  offset = tzOffsetMinutes(tzid, new Date(candidate))
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000)
}

/**
 * Renvoie l'offset (en minutes) du fuseau tzid à l'instant date.
 * Positif si à l'est de UTC (ex: Europe/Paris = +60 ou +120 en été).
 */
export function tzOffsetMinutes(tzid: string, date: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('sv-SE', {
      timeZone: tzid,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts: Record<string, string> = {}
    for (const p of dtf.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value
    }
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === '24' ? '0' : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    )
    return (asUtc - date.getTime()) / 60_000
  } catch {
    return 0
  }
}

// ───────────────────────────── DURATION ───────────────────────────────────

/**
 * Parse une valeur DURATION (RFC 5545 §3.3.6). Supporte les formes
 * fréquentes : P1D, PT1H, PT30M, PT1H30M, P1DT2H, et le préfixe '-' (rare).
 * Retourne la durée en millisecondes (toujours positive ici).
 */
export function parseDuration(value: string): number {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value)
  if (!m) return 0
  const weeks = Number(m[2] || 0)
  const days = Number(m[3] || 0)
  const hours = Number(m[4] || 0)
  const minutes = Number(m[5] || 0)
  const seconds = Number(m[6] || 0)
  const ms =
    weeks * 7 * 86_400_000 +
    days * 86_400_000 +
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1_000
  return ms
}

// ─────────────────────────── RRULE expansion ──────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export interface RruleParsed {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: Date | null
  byday: number[] | null
}

export function parseRrule(value: string): RruleParsed | null {
  const parts: Record<string, string> = {}
  for (const seg of value.split(';')) {
    const eq = seg.indexOf('=')
    if (eq === -1) continue
    parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1)
  }
  const freqRaw = parts.FREQ?.toUpperCase()
  if (freqRaw !== 'DAILY' && freqRaw !== 'WEEKLY' && freqRaw !== 'MONTHLY' && freqRaw !== 'YEARLY') {
    return null
  }
  const interval = Math.max(1, Number(parts.INTERVAL || 1))
  const count = parts.COUNT ? Number(parts.COUNT) : null
  let until: Date | null = null
  if (parts.UNTIL) {
    try {
      until = parseIcsDate(parts.UNTIL, null).date
    } catch {
      until = null
    }
  }
  const byday = parts.BYDAY
    ? parts.BYDAY.split(',')
        .map((d) => WEEKDAY_INDEX[d.slice(-2).toUpperCase()])
        .filter((d): d is number => typeof d === 'number')
    : null
  return { freq: freqRaw, interval, count, until, byday: byday && byday.length ? byday : null }
}

const MAX_OCCURRENCES = 500

/**
 * Expanse une RRULE en une liste d'instants de départ (UTC) dans la fenêtre
 * [windowStart, windowEnd]. Limité à MAX_OCCURRENCES par sécurité.
 */
export function expandRrule(
  start: Date,
  rrule: RruleParsed,
  windowStart: Date,
  windowEnd: Date,
  exdates: Set<number>,
): Date[] {
  const out: Date[] = []
  if (rrule.freq === 'WEEKLY' && rrule.byday && rrule.byday.length) {
    return expandWeeklyByDay(start, rrule, windowStart, windowEnd, exdates)
  }
  const stepMs = stepMsFor(rrule.freq, rrule.interval)
  let cursor = new Date(start.getTime())
  let produced = 0
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    if (rrule.until && cursor.getTime() > rrule.until.getTime()) break
    if (cursor.getTime() > windowEnd.getTime()) break
    if (cursor.getTime() >= windowStart.getTime() && !exdates.has(cursor.getTime())) {
      out.push(new Date(cursor.getTime()))
    }
    produced++
    if (rrule.count !== null && produced >= rrule.count) break
    if (rrule.freq === 'MONTHLY') {
      cursor = addMonths(cursor, rrule.interval)
    } else if (rrule.freq === 'YEARLY') {
      cursor = addMonths(cursor, 12 * rrule.interval)
    } else {
      cursor = new Date(cursor.getTime() + stepMs)
    }
  }
  return out
}

function stepMsFor(freq: RruleParsed['freq'], interval: number): number {
  switch (freq) {
    case 'DAILY':
      return interval * 86_400_000
    case 'WEEKLY':
      return interval * 7 * 86_400_000
    default:
      return interval * 86_400_000
  }
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + months,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  ))
}

function expandWeeklyByDay(
  start: Date,
  rrule: RruleParsed,
  windowStart: Date,
  windowEnd: Date,
  exdates: Set<number>,
): Date[] {
  const out: Date[] = []
  const startMs = start.getTime()
  // Semaine 0 : semaine qui contient l'événement d'origine, lundi de cette semaine.
  const startDow = start.getUTCDay()
  // Lundi comme premier jour pour l'incrément, conforme à l'usage Apple.
  const daysToMonday = (startDow + 6) % 7
  const week0 = new Date(startMs - daysToMonday * 86_400_000)
  const targetDows = (rrule.byday || []).slice().sort((a, b) => a - b)
  const interval = rrule.interval
  let produced = 0
  for (let w = 0; w < MAX_OCCURRENCES; w++) {
    const weekStart = new Date(week0.getTime() + w * interval * 7 * 86_400_000)
    if (weekStart.getTime() > windowEnd.getTime() + 7 * 86_400_000) break
    for (const dow of targetDows) {
      const offsetDays = (dow + 6) % 7 // lundi=0
      const occ = new Date(weekStart.getTime() + offsetDays * 86_400_000)
      // Conserver l'heure exacte de start
      occ.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), 0)
      if (occ.getTime() < startMs) continue
      if (rrule.until && occ.getTime() > rrule.until.getTime()) return out
      if (rrule.count !== null && produced >= rrule.count) return out
      produced++
      if (occ.getTime() > windowEnd.getTime()) continue
      if (occ.getTime() < windowStart.getTime()) continue
      if (exdates.has(occ.getTime())) continue
      out.push(occ)
    }
  }
  return out
}

// ─────────────────────────── Parsing principal ────────────────────────────

/**
 * Parse un flux ICS en VEVENT bruts (sans expansion RRULE).
 */
export function parseIcs(raw: string): ParsedIcsEvent[] {
  const lines = unfoldLines(raw)
  const events: ParsedIcsEvent[] = []
  let current: Partial<ParsedIcsEvent> | null = null
  // Profondeur de blocs imbriqués que l'on doit ignorer (VALARM dans VEVENT,
  // VTIMEZONE au niveau VCALENDAR, etc.). Quand > 0, on saute les propriétés.
  let skipDepth = 0
  let dtstartValue: { tzid: string | null; value: string } | null = null
  let dtendValue: { tzid: string | null; value: string } | null = null
  let duration: number | null = null

  for (const line of lines) {
    if (line.startsWith('BEGIN:')) {
      const what = line.slice('BEGIN:'.length).toUpperCase()
      if (what === 'VEVENT' && !current) {
        current = {
          uid: '',
          summary: '',
          description: '',
          location: '',
          url: '',
          status: '',
          allDay: false,
          rrule: null,
          exdates: [],
          tzid: null,
        }
        dtstartValue = null
        dtendValue = null
        duration = null
      } else if (what !== 'VCALENDAR') {
        // Bloc inconnu : on ignore tout son contenu (VTIMEZONE, VALARM, VTODO…).
        skipDepth++
      }
      continue
    }
    if (line.startsWith('END:')) {
      const what = line.slice('END:'.length).toUpperCase()
      if (what === 'VEVENT' && current && skipDepth === 0) {
        if (dtstartValue) {
          const { date, allDay } = parseIcsDate(dtstartValue.value, dtstartValue.tzid)
          current.start = date
          current.allDay = allDay
          current.tzid = dtstartValue.tzid
        }
        if (dtendValue) {
          const { date } = parseIcsDate(dtendValue.value, dtendValue.tzid)
          current.end = date
        } else if (current.start && duration !== null) {
          current.end = new Date(current.start.getTime() + duration)
        } else if (current.start && current.allDay) {
          current.end = new Date(current.start.getTime() + 86_400_000)
        } else if (current.start) {
          // Apple n'envoie pas toujours DTEND ; on prend 1h par défaut.
          current.end = new Date(current.start.getTime() + 3_600_000)
        }
        if (current.start && current.end) {
          events.push(current as ParsedIcsEvent)
        }
        current = null
        dtstartValue = null
        dtendValue = null
        duration = null
      } else if (what !== 'VCALENDAR' && skipDepth > 0) {
        skipDepth--
      }
      continue
    }
    if (skipDepth > 0) continue
    if (!current) continue

    const prop = parseProperty(line)
    if (!prop) continue
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value
        break
      case 'SUMMARY':
        current.summary = unescapeValue(prop.value)
        break
      case 'DESCRIPTION':
        current.description = unescapeValue(prop.value)
        break
      case 'LOCATION':
        current.location = unescapeValue(prop.value)
        break
      case 'URL':
        current.url = prop.value
        break
      case 'STATUS':
        current.status = prop.value
        break
      case 'DTSTART':
        dtstartValue = { tzid: prop.params.TZID || null, value: prop.value }
        break
      case 'DTEND':
        dtendValue = { tzid: prop.params.TZID || null, value: prop.value }
        break
      case 'DURATION':
        duration = parseDuration(prop.value)
        break
      case 'RRULE':
        current.rrule = prop.value
        break
      case 'EXDATE': {
        const exTzid = prop.params.TZID || null
        for (const part of prop.value.split(',')) {
          try {
            const { date } = parseIcsDate(part, exTzid)
            current.exdates!.push(date.toISOString())
          } catch {
            // ignore malformed
          }
        }
        break
      }
      default:
        break
    }
  }
  return events
}

/**
 * Parse + expanse les RRULE et restreint à la fenêtre [windowStart, windowEnd].
 */
export function parseAndExpand(
  raw: string,
  windowStart: Date,
  windowEnd: Date,
): ExpandedEvent[] {
  const events = parseIcs(raw)
  const out: ExpandedEvent[] = []
  for (const ev of events) {
    const durationMs = Math.max(0, ev.end.getTime() - ev.start.getTime())
    const exdates = new Set<number>(ev.exdates.map((iso) => new Date(iso).getTime()))
    const occurrences: Date[] = []
    if (ev.rrule) {
      const rule = parseRrule(ev.rrule)
      if (rule) {
        for (const occ of expandRrule(ev.start, rule, windowStart, windowEnd, exdates)) {
          occurrences.push(occ)
        }
      } else if (
        ev.start.getTime() <= windowEnd.getTime() &&
        ev.end.getTime() >= windowStart.getTime() &&
        !exdates.has(ev.start.getTime())
      ) {
        occurrences.push(ev.start)
      }
    } else {
      if (
        ev.start.getTime() <= windowEnd.getTime() &&
        ev.end.getTime() >= windowStart.getTime() &&
        !exdates.has(ev.start.getTime())
      ) {
        occurrences.push(ev.start)
      }
    }
    for (const startAt of occurrences) {
      const endAt = new Date(startAt.getTime() + durationMs)
      out.push({
        uid: ev.uid,
        summary: ev.summary,
        description: ev.description,
        location: ev.location,
        url: ev.url,
        status: ev.status,
        start: startAt.toISOString(),
        end: endAt.toISOString(),
        durationMin: Math.round(durationMs / 60_000),
        allDay: ev.allDay,
        occurrenceId: ev.rrule ? `${ev.uid}@${startAt.toISOString()}` : ev.uid,
      })
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}
