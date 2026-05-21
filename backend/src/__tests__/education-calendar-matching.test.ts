import { describe, it, expect } from 'vitest'
import {
  matchEventToClass,
  matchEventsToClasses,
  type ClassCandidate,
} from '../lib/appleCalendar/matching.js'

const CLASSES: ClassCandidate[] = [
  {
    _id: 'c-ema-b3',
    name: 'EMA B3 Marketing',
    school: 'EMA',
    level: 'B3',
    program: 'Marketing digital',
    color: '#22C55E',
  },
  {
    _id: 'c-mbway-ndrc',
    name: 'MBWAY BTS NDRC 2',
    school: 'MBWAY',
    level: 'BTS',
    program: 'NDRC',
    color: '#0EA5E9',
  },
  {
    _id: 'c-esve-uxui',
    name: 'ESVE M1 UX/UI',
    school: 'ESVE',
    level: 'M1',
    program: 'UX UI Design',
    color: '#A855F7',
  },
  {
    _id: 'c-ggi-mco',
    name: 'GGI BTS MCO 1',
    school: 'GGI',
    level: 'BTS',
    program: 'MCO',
    color: '#F59E0B',
  },
]

describe('appleCalendar / matching', () => {
  it('returns null when no class candidate exists', () => {
    expect(matchEventToClass({ title: 'Cours EMA' }, [])).toBeNull()
  })

  it('matches exactly when the class name appears verbatim in the event', () => {
    const m = matchEventToClass(
      { title: 'EMA B3 Marketing — séance SEO', location: 'EMA Paris' },
      CLASSES,
    )
    expect(m).not.toBeNull()
    expect(m!.classId).toBe('c-ema-b3')
    expect(m!.reason).toBe('exact-name')
  })

  it('matches on overlapping tokens (school + level + program)', () => {
    const m = matchEventToClass(
      {
        title: 'Atelier NDRC',
        location: 'MBWAY Paris — Salle 204',
        description: 'BTS NDRC 2 — relance commerciale',
        inferredSchool: 'MBWAY',
      },
      CLASSES,
    )
    expect(m).not.toBeNull()
    expect(m!.classId).toBe('c-mbway-ndrc')
    expect(m!.reason).toBe('tokens')
  })

  it('respects the inferred school: a competing class from another school is ignored', () => {
    // Event with strong "BTS" + "MCO" hints, but inferred school = GGI.
    // Should pick GGI BTS MCO, not the MBWAY BTS NDRC despite "BTS" overlap.
    const m = matchEventToClass(
      {
        title: 'BTS MCO — révisions',
        location: 'GGI',
        inferredSchool: 'GGI',
      },
      CLASSES,
    )
    expect(m).not.toBeNull()
    expect(m!.classId).toBe('c-ggi-mco')
  })

  it('returns null when nothing meaningful overlaps', () => {
    const m = matchEventToClass(
      { title: 'Rendez-vous dentiste', location: 'Paris' },
      CLASSES,
    )
    expect(m).toBeNull()
  })

  it('handles accents and casing in titles', () => {
    const m = matchEventToClass(
      { title: 'ÉCOLE — Séance UX/UI ESVE M1' },
      CLASSES,
    )
    expect(m).not.toBeNull()
    expect(m!.classId).toBe('c-esve-uxui')
  })

  it('skips matches when inferred school conflicts with class school', () => {
    // Inferred ESVE but description tries to drag MBWAY in — must not match MBWAY.
    const m = matchEventToClass(
      {
        title: 'Cours ESVE',
        description: 'mention MBWAY BTS NDRC en intro',
        inferredSchool: 'ESVE',
      },
      CLASSES,
    )
    if (m) {
      expect(m.school).toBe('ESVE')
    }
  })

  it('batches via matchEventsToClasses preserving order', () => {
    const events = [
      { title: 'EMA B3 Marketing' },
      { title: 'Rendez-vous dentiste' },
      { title: 'ESVE M1 UX/UI' },
    ]
    const matches = matchEventsToClasses(events, CLASSES)
    expect(matches).toHaveLength(3)
    expect(matches[0].match?.classId).toBe('c-ema-b3')
    expect(matches[1].match).toBeNull()
    expect(matches[2].match?.classId).toBe('c-esve-uxui')
  })
})
