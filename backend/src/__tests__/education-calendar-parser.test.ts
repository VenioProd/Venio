import { describe, it, expect } from 'vitest'
import {
  unfoldLines,
  parseProperty,
  unescapeValue,
  parseIcsDate,
  tzOffsetMinutes,
  parseDuration,
  parseRrule,
  parseIcs,
  parseAndExpand,
} from '../lib/appleCalendar/ics.js'

describe('appleCalendar / ics — primitives', () => {
  it('unfolds RFC 5545 continuation lines', () => {
    const raw = 'SUMMARY:Cours de\r\n  marketing\r\nLOCATION:Paris'
    expect(unfoldLines(raw)).toEqual([
      'SUMMARY:Cours de marketing',
      'LOCATION:Paris',
    ])
  })

  it('parses properties with TZID and quoted params', () => {
    const p = parseProperty('DTSTART;TZID=Europe/Paris:20251201T140000')!
    expect(p.name).toBe('DTSTART')
    expect(p.params.TZID).toBe('Europe/Paris')
    expect(p.value).toBe('20251201T140000')

    const q = parseProperty('ATTENDEE;CN="Foo: Bar";ROLE=REQ-PARTICIPANT:mailto:a@b.c')!
    expect(q.name).toBe('ATTENDEE')
    expect(q.params.CN).toBe('Foo: Bar')
    expect(q.params.ROLE).toBe('REQ-PARTICIPANT')
    expect(q.value).toBe('mailto:a@b.c')
  })

  it('unescapes \\n, \\,, \\;, \\\\', () => {
    expect(unescapeValue('a\\nb\\,c\\;d\\\\e')).toBe('a\nb,c;d\\e')
  })

  it('parses UTC datetimes (Z suffix)', () => {
    const { date, allDay } = parseIcsDate('20251201T140000Z', null)
    expect(allDay).toBe(false)
    expect(date.toISOString()).toBe('2025-12-01T14:00:00.000Z')
  })

  it('parses datetimes with TZID (Europe/Paris winter = +1)', () => {
    const { date } = parseIcsDate('20251201T140000', 'Europe/Paris')
    expect(date.toISOString()).toBe('2025-12-01T13:00:00.000Z')
  })

  it('parses datetimes with TZID across DST boundary (Europe/Paris summer = +2)', () => {
    const { date } = parseIcsDate('20250715T090000', 'Europe/Paris')
    expect(date.toISOString()).toBe('2025-07-15T07:00:00.000Z')
  })

  it('parses VALUE=DATE (all-day) as UTC midnight', () => {
    const { date, allDay } = parseIcsDate('20251201', null)
    expect(allDay).toBe(true)
    expect(date.toISOString()).toBe('2025-12-01T00:00:00.000Z')
  })

  it('tzOffsetMinutes returns the expected offset for Europe/Paris', () => {
    // Winter
    expect(tzOffsetMinutes('Europe/Paris', new Date('2025-12-01T12:00:00Z'))).toBe(60)
    // Summer
    expect(tzOffsetMinutes('Europe/Paris', new Date('2025-07-15T12:00:00Z'))).toBe(120)
  })

  it('parses DURATION in common forms', () => {
    expect(parseDuration('PT1H')).toBe(60 * 60_000)
    expect(parseDuration('PT30M')).toBe(30 * 60_000)
    expect(parseDuration('PT1H30M')).toBe(90 * 60_000)
    expect(parseDuration('P1D')).toBe(86_400_000)
    expect(parseDuration('P1DT2H')).toBe(86_400_000 + 2 * 3_600_000)
    expect(parseDuration('NOPE')).toBe(0)
  })

  it('parses RRULE basics', () => {
    const r = parseRrule('FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=1;COUNT=10')!
    expect(r.freq).toBe('WEEKLY')
    expect(r.interval).toBe(1)
    expect(r.count).toBe(10)
    expect(r.byday).toEqual([1, 3])
  })

  it('rejects unsupported FREQ', () => {
    expect(parseRrule('FREQ=SECONDLY')).toBeNull()
  })
})

const SAMPLE_VEVENT = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//iCloud Calendar//FR
BEGIN:VTIMEZONE
TZID:Europe/Paris
END:VTIMEZONE
BEGIN:VEVENT
UID:event-1@example.com
SUMMARY:Cours MBWAY — BTS NDRC
LOCATION:MBWAY Paris — Salle 204
DESCRIPTION:Marketing digital\\nThème : SEO
DTSTART;TZID=Europe/Paris:20251201T140000
DTEND;TZID=Europe/Paris:20251201T160000
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:weekly-1@example.com
SUMMARY:UX/UI — ESVE
DTSTART;TZID=Europe/Paris:20251202T100000
DTEND;TZID=Europe/Paris:20251202T120000
RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4
END:VEVENT
END:VCALENDAR`

describe('appleCalendar / ics — parseIcs', () => {
  it('extracts VEVENTs, ignoring VTIMEZONE', () => {
    const events = parseIcs(SAMPLE_VEVENT)
    expect(events).toHaveLength(2)
    const [a, b] = events
    expect(a.uid).toBe('event-1@example.com')
    expect(a.summary).toBe('Cours MBWAY — BTS NDRC')
    expect(a.location).toBe('MBWAY Paris — Salle 204')
    expect(a.description).toContain('SEO')
    expect(a.start.toISOString()).toBe('2025-12-01T13:00:00.000Z')
    expect(a.end.toISOString()).toBe('2025-12-01T15:00:00.000Z')
    expect(a.status).toBe('CONFIRMED')
    expect(b.rrule).toContain('WEEKLY')
  })
})

describe('appleCalendar / ics — parseAndExpand', () => {
  it('expands a WEEKLY BYDAY=TU rule into 4 occurrences within window', () => {
    const expanded = parseAndExpand(
      SAMPLE_VEVENT,
      new Date('2025-12-01T00:00:00Z'),
      new Date('2026-01-15T00:00:00Z'),
    )
    // 1 simple + 4 occurrences
    const weekly = expanded.filter((e) => e.uid === 'weekly-1@example.com')
    expect(weekly).toHaveLength(4)
    const dates = weekly.map((e) => e.start)
    expect(dates).toEqual([
      '2025-12-02T09:00:00.000Z',
      '2025-12-09T09:00:00.000Z',
      '2025-12-16T09:00:00.000Z',
      '2025-12-23T09:00:00.000Z',
    ])
  })

  it('returns events sorted by start', () => {
    const expanded = parseAndExpand(
      SAMPLE_VEVENT,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2026-01-15T00:00:00Z'),
    )
    for (let i = 1; i < expanded.length; i++) {
      expect(expanded[i - 1].start <= expanded[i].start).toBe(true)
    }
  })

  it('respects EXDATE to skip occurrences', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly-ex@example.com
SUMMARY:Cours hebdo
DTSTART:20251201T140000Z
DTEND:20251201T160000Z
RRULE:FREQ=WEEKLY;COUNT=3
EXDATE:20251208T140000Z
END:VEVENT
END:VCALENDAR`
    const expanded = parseAndExpand(
      raw,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2026-01-15T00:00:00Z'),
    )
    expect(expanded).toHaveLength(2)
    expect(expanded.map((e) => e.start)).toEqual([
      '2025-12-01T14:00:00.000Z',
      '2025-12-15T14:00:00.000Z',
    ])
  })

  it('falls back to 1h duration when DTEND and DURATION are absent', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:no-end@example.com
SUMMARY:Pas de fin
DTSTART:20251201T140000Z
END:VEVENT
END:VCALENDAR`
    const expanded = parseAndExpand(
      raw,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
    )
    expect(expanded).toHaveLength(1)
    expect(expanded[0].durationMin).toBe(60)
    expect(expanded[0].end).toBe('2025-12-01T15:00:00.000Z')
  })

  it('honors DURATION when DTEND is missing', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:dur@example.com
SUMMARY:Avec durée
DTSTART:20251201T140000Z
DURATION:PT90M
END:VEVENT
END:VCALENDAR`
    const expanded = parseAndExpand(
      raw,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
    )
    expect(expanded[0].durationMin).toBe(90)
  })

  it('handles all-day events (VALUE=DATE)', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:allday@example.com
SUMMARY:Examen
DTSTART;VALUE=DATE:20251215
DTEND;VALUE=DATE:20251216
END:VEVENT
END:VCALENDAR`
    const expanded = parseAndExpand(
      raw,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2025-12-31T00:00:00Z'),
    )
    expect(expanded).toHaveLength(1)
    expect(expanded[0].allDay).toBe(true)
    expect(expanded[0].start).toBe('2025-12-15T00:00:00.000Z')
  })

  it('drops events fully outside the window', () => {
    const expanded = parseAndExpand(
      SAMPLE_VEVENT,
      new Date('2030-01-01T00:00:00Z'),
      new Date('2030-02-01T00:00:00Z'),
    )
    expect(expanded).toEqual([])
  })

  it('honors UNTIL to stop expansion', () => {
    const raw = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:until@example.com
SUMMARY:Cours hebdo
DTSTART:20251201T140000Z
DTEND:20251201T160000Z
RRULE:FREQ=WEEKLY;UNTIL=20251215T140000Z
END:VEVENT
END:VCALENDAR`
    const expanded = parseAndExpand(
      raw,
      new Date('2025-11-01T00:00:00Z'),
      new Date('2026-01-15T00:00:00Z'),
    )
    expect(expanded.map((e) => e.start)).toEqual([
      '2025-12-01T14:00:00.000Z',
      '2025-12-08T14:00:00.000Z',
      '2025-12-15T14:00:00.000Z',
    ])
  })
})
