import { describe, expect, it } from 'vitest'
import {
  fromCalendarApi,
  fromIcs,
  fromSessions,
  hourRange,
  isoDay,
  layoutTimed,
  monthCells,
  weekDays,
  type CalEvent,
} from '../calendar'

describe('calendrier de l’accueil', () => {
  it('commence la semaine le lundi et borne le mois à 5 ou 6 semaines', () => {
    const week = weekDays(new Date(2026, 10, 1)) // dimanche 1er novembre
    expect(isoDay(week[0])).toBe('2026-10-26')
    expect(isoDay(week[6])).toBe('2026-11-01')
    const cells = monthCells(new Date(2026, 10, 15))
    expect(cells.length % 7).toBe(0)
    expect(isoDay(cells[0])).toBe('2026-10-26')
  })

  it('répartit les créneaux qui se chevauchent en colonnes', () => {
    const ev = (id: string, start: number, end: number): CalEvent => ({
      id,
      kind: 'event',
      title: id,
      date: '2026-11-01',
      start,
      end,
    })
    const lanes = layoutTimed([ev('a', 540, 600), ev('b', 570, 630), ev('c', 660, 690)])
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 })
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 1 })
  })

  it('élargit la plage horaire quand un créneau en sort', () => {
    expect(hourRange([])).toEqual({ from: 8, to: 19 })
    expect(
      hourRange([{ id: 'x', kind: 'session', title: 'x', date: '2026-11-01', start: 17 * 60, end: 21 * 60 }]),
    ).toEqual({ from: 8, to: 21 })
  })

  it('normalise les sources : agrégat projet, sessions, flux ICS', () => {
    const api = fromCalendarApi(
      [
        {
          id: 'task_1',
          type: 'task',
          title: 'Relire',
          date: '2026-10-30',
          projectId: 'p1',
          projectName: 'Orée',
          metadata: { status: 'A_FAIRE' },
        },
        { id: 'decision_1', type: 'decision', title: 'Budget', date: '2026-11-07', projectId: null, projectName: '' },
        {
          id: 'project_end_1',
          type: 'project_end',
          title: 'Fin: Orée',
          date: '2026-11-28',
          projectId: 'p1',
          projectName: 'Orée',
        },
      ],
      '2026-11-01',
    )
    expect(api.map((e) => [e.kind, e.link, Boolean(e.late)])).toEqual([
      ['task', '/admin/projets/p1', true],
      ['decision', '/admin/decisions', false],
      ['project', '/admin/projets/p1', false],
    ])
    expect(api[2]).toMatchObject({ title: 'Orée', titleKey: 'projectEnd' })

    const [session] = fromSessions([
      {
        _id: 's1',
        title: 'Bachelor 1',
        date: new Date(2026, 10, 2, 9, 0).toISOString(),
        durationMin: 120,
        classId: { name: 'B1' },
      },
    ])
    expect(session).toMatchObject({ kind: 'session', date: '2026-11-02', start: 540, end: 660, who: 'B1' })
    expect(fromSessions([{ _id: 's2', title: 'x', date: new Date().toISOString(), status: 'ANNULEE' }])).toEqual([])

    const [timed, allDay] = fromIcs([
      {
        occurrenceId: 'o1',
        title: 'Point hebdo',
        start: new Date(2026, 10, 1, 9, 30).toISOString(),
        end: new Date(2026, 10, 1, 10, 0).toISOString(),
      },
      { occurrenceId: 'o2', title: 'Férié', start: '2026-11-11', allDay: true },
    ])
    expect(timed).toMatchObject({ kind: 'event', date: '2026-11-01', start: 570, end: 600, link: null })
    expect(allDay).toMatchObject({ date: '2026-11-11' })
    expect(allDay.start).toBeUndefined()
  })
})
