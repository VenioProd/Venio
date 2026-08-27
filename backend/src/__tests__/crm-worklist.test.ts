import { describe, it, expect } from 'vitest'
import { buildWorklist, type WorklistSettings } from '../lib/crmAutomations.js'

// Référence temporelle fixe pour tous les tests : mercredi 2026-08-26, 14 h 00 locales.
const NOW = new Date('2026-08-26T14:00:00')

function daysBefore(days: number, hours = 0): Date {
  const date = new Date(NOW)
  date.setDate(date.getDate() - days)
  date.setHours(hours, 0, 0, 0)
  return date
}

function daysAfter(days: number, hours = 12): Date {
  const date = new Date(NOW)
  date.setDate(date.getDate() + days)
  date.setHours(hours, 0, 0, 0)
  return date
}

const SETTINGS: WorklistSettings = {
  coldLeadAlertEnabled: true,
  coldLeadThresholdDays: 7,
  overdueAlertEnabled: true,
  staleLeadAlertEnabled: true,
  staleLeadThresholdDays: 14,
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    _id: String(overrides._id ?? 'lead-1'),
    company: 'Acme',
    status: 'LEAD',
    priority: 'NORMALE',
    ...overrides,
  }
}

describe('buildWorklist — classement par échéance', () => {
  it('place une échéance passée dans "overdue"', () => {
    const groups = buildWorklist([lead({ nextActionAt: daysBefore(2) })], SETTINGS, NOW)
    expect(groups.overdue).toHaveLength(1)
    expect(groups.today).toHaveLength(0)
  })

  it('place une échéance du jour dans "today", quelle que soit l\'heure', () => {
    const thisMorning = new Date(NOW)
    thisMorning.setHours(0, 1, 0, 0)
    const tonight = new Date(NOW)
    tonight.setHours(23, 59, 0, 0)

    const groups = buildWorklist(
      [lead({ _id: 'a', nextActionAt: thisMorning }), lead({ _id: 'b', nextActionAt: tonight })],
      SETTINGS,
      NOW,
    )

    expect(groups.today.map((l) => l._id).sort()).toEqual(['a', 'b'])
    expect(groups.overdue).toHaveLength(0)
  })

  it('place une échéance dans les 7 jours dans "upcoming"', () => {
    const groups = buildWorklist([lead({ nextActionAt: daysAfter(6) })], SETTINGS, NOW)
    expect(groups.upcoming).toHaveLength(1)
  })

  it('ignore une échéance au-delà de 7 jours', () => {
    const groups = buildWorklist([lead({ nextActionAt: daysAfter(20) })], SETTINGS, NOW)
    expect(groups.overdue).toHaveLength(0)
    expect(groups.today).toHaveLength(0)
    expect(groups.upcoming).toHaveLength(0)
    expect(groups.drifting).toHaveLength(0)
  })

  it('ignore un lead sans échéance ni dérive', () => {
    const groups = buildWorklist([lead({ nextActionAt: null })], SETTINGS, NOW)
    expect(groups.overdue.concat(groups.today, groups.upcoming, groups.drifting)).toHaveLength(0)
  })
})

describe('buildWorklist — signaux de dérive', () => {
  it('place un lead froid dans "drifting"', () => {
    const groups = buildWorklist([lead({ lastContactAt: daysBefore(10) })], SETTINGS, NOW)
    expect(groups.drifting).toHaveLength(1)
  })

  it('place un lead bloqué dans "drifting"', () => {
    const groups = buildWorklist([lead({ statusChangedAt: daysBefore(20) })], SETTINGS, NOW)
    expect(groups.drifting).toHaveLength(1)
  })

  it('respecte un seuil de froideur non standard', () => {
    const leads = [lead({ lastContactAt: daysBefore(4) })]
    expect(buildWorklist(leads, SETTINGS, NOW).drifting).toHaveLength(0)
    expect(buildWorklist(leads, { ...SETTINGS, coldLeadThresholdDays: 3 }, NOW).drifting).toHaveLength(1)
  })

  it('respecte un seuil de blocage non standard', () => {
    const leads = [lead({ statusChangedAt: daysBefore(10) })]
    expect(buildWorklist(leads, SETTINGS, NOW).drifting).toHaveLength(0)
    expect(buildWorklist(leads, { ...SETTINGS, staleLeadThresholdDays: 5 }, NOW).drifting).toHaveLength(1)
  })

  it('ne classe pas deux fois un lead à la fois en retard et froid', () => {
    const groups = buildWorklist([lead({ nextActionAt: daysBefore(2), lastContactAt: daysBefore(30) })], SETTINGS, NOW)
    expect(groups.overdue).toHaveLength(1)
    expect(groups.drifting).toHaveLength(0)
  })

  it("classe en dérive un lead dont l'échéance est trop lointaine pour le classer", () => {
    const groups = buildWorklist([lead({ nextActionAt: daysAfter(30), lastContactAt: daysBefore(30) })], SETTINGS, NOW)
    expect(groups.upcoming).toHaveLength(0)
    expect(groups.drifting).toHaveLength(1)
  })
})

describe('buildWorklist — drapeaux de désactivation', () => {
  it('vide "overdue" quand overdueAlertEnabled est faux', () => {
    const groups = buildWorklist(
      [lead({ nextActionAt: daysBefore(2) })],
      { ...SETTINGS, overdueAlertEnabled: false },
      NOW,
    )
    expect(groups.overdue).toHaveLength(0)
  })

  it("laisse un retard désactivé retomber en dérive s'il est froid par ailleurs", () => {
    const groups = buildWorklist(
      [lead({ nextActionAt: daysBefore(2), lastContactAt: daysBefore(30) })],
      { ...SETTINGS, overdueAlertEnabled: false },
      NOW,
    )
    expect(groups.overdue).toHaveLength(0)
    expect(groups.drifting).toHaveLength(1)
  })

  it('n\'affecte pas "today" ni "upcoming" quand overdueAlertEnabled est faux', () => {
    const groups = buildWorklist(
      [lead({ _id: 'a', nextActionAt: NOW }), lead({ _id: 'b', nextActionAt: daysAfter(3) })],
      { ...SETTINGS, overdueAlertEnabled: false },
      NOW,
    )
    expect(groups.today).toHaveLength(1)
    expect(groups.upcoming).toHaveLength(1)
  })

  it('vide la part "froid" de la dérive sans toucher à la part "bloqué"', () => {
    const groups = buildWorklist(
      [lead({ _id: 'a', lastContactAt: daysBefore(30) }), lead({ _id: 'b', statusChangedAt: daysBefore(30) })],
      { ...SETTINGS, coldLeadAlertEnabled: false },
      NOW,
    )
    expect(groups.drifting.map((l) => l._id)).toEqual(['b'])
  })

  it('vide la part "bloqué" de la dérive sans toucher à la part "froid"', () => {
    const groups = buildWorklist(
      [lead({ _id: 'a', lastContactAt: daysBefore(30) }), lead({ _id: 'b', statusChangedAt: daysBefore(30) })],
      { ...SETTINGS, staleLeadAlertEnabled: false },
      NOW,
    )
    expect(groups.drifting.map((l) => l._id)).toEqual(['a'])
  })
})

describe('buildWorklist — exclusions et tri', () => {
  it('exclut les leads WON et LOST de tous les groupes', () => {
    const groups = buildWorklist(
      [
        lead({ _id: 'won', status: 'WON', nextActionAt: daysBefore(2), lastContactAt: daysBefore(30) }),
        lead({ _id: 'lost', status: 'LOST', nextActionAt: daysBefore(2), statusChangedAt: daysBefore(30) }),
      ],
      SETTINGS,
      NOW,
    )
    expect(groups.overdue.concat(groups.today, groups.upcoming, groups.drifting)).toHaveLength(0)
  })

  it('trie par échéance croissante', () => {
    const groups = buildWorklist(
      [lead({ _id: 'recent', nextActionAt: daysBefore(1) }), lead({ _id: 'ancien', nextActionAt: daysBefore(9) })],
      SETTINGS,
      NOW,
    )
    expect(groups.overdue.map((l) => l._id)).toEqual(['ancien', 'recent'])
  })

  it('départage deux échéances identiques par la priorité', () => {
    const sameDate = daysBefore(3)
    const groups = buildWorklist(
      [
        lead({ _id: 'basse', nextActionAt: sameDate, priority: 'BASSE' }),
        lead({ _id: 'urgente', nextActionAt: sameDate, priority: 'URGENTE' }),
        lead({ _id: 'haute', nextActionAt: sameDate, priority: 'HAUTE' }),
      ],
      SETTINGS,
      NOW,
    )
    expect(groups.overdue.map((l) => l._id)).toEqual(['urgente', 'haute', 'basse'])
  })

  it('départage une priorité identique par le score décroissant', () => {
    const sameDate = daysBefore(3)
    const groups = buildWorklist(
      [
        lead({ _id: 'faible', nextActionAt: sameDate, score: 10 }),
        lead({ _id: 'fort', nextActionAt: sameDate, score: 80 }),
      ],
      SETTINGS,
      NOW,
    )
    expect(groups.overdue.map((l) => l._id)).toEqual(['fort', 'faible'])
  })

  it('place les leads sans échéance après ceux qui en ont, dans la dérive', () => {
    const groups = buildWorklist(
      [
        lead({ _id: 'sans-echeance', lastContactAt: daysBefore(30) }),
        lead({ _id: 'avec-echeance', nextActionAt: daysAfter(30), lastContactAt: daysBefore(30) }),
      ],
      SETTINGS,
      NOW,
    )
    expect(groups.drifting.map((l) => l._id)).toEqual(['avec-echeance', 'sans-echeance'])
  })
})
