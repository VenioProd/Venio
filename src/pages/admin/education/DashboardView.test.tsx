import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardView } from './DashboardView'
vi.mock('./EducationAiDraft', () => ({ EducationAiDraftPanel: () => null }))
afterEach(cleanup)
it('offers semantic direct session/live/correction actions and a separate class action', () => {
  const onOpenSession = vi.fn(),
    onStartLive = vi.fn(),
    onStartCorrection = vi.fn(),
    onOpenClass = vi.fn()
  const klass = { _id: 'c1', name: 'Master', school: 'A' }
  render(
    <DashboardView
      dashboard={
        {
          counters: {
            activeClasses: 1,
            totalStudents: 1,
            todaySessions: 1,
            weekSessions: 1,
            toPrepare: 0,
            toGrade: 1,
            lateSubmissions: 0,
          },
          schools: ['A'],
          today: [{ _id: 's1', title: 'Séance du jour', classId: klass, date: '2026-09-12', status: 'PLANIFIEE' }],
          week: [],
          toPrepare: [],
          toCorrect: [{ _id: 'a1', title: 'Exercice', classId: klass, kind: 'DEVOIR', status: 'OUVERT' }],
          lastSessionByClass: [],
          alerts: [],
          activity: [],
        } as never
      }
      selectedSchool="A"
      onChangeSchool={() => {}}
      onOpenSession={onOpenSession}
      onStartLive={onStartLive}
      onStartCorrection={onStartCorrection}
      onOpenClass={onOpenClass}
      onOpenStudent={() => {}}
      onCreateClass={() => {}}
      onReload={() => {}}
      reloadError={null}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Séance du jour' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lancer la séance Séance du jour' }))
  fireEvent.click(screen.getByRole('button', { name: 'Corriger Exercice' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Ouvrir la classe Master' })[0])
  expect(onOpenSession).toHaveBeenCalledWith('s1')
  expect(onStartLive).toHaveBeenCalledWith('s1')
  expect(onStartCorrection).toHaveBeenCalledWith('a1')
  expect(onOpenClass).toHaveBeenCalledWith('c1')
  expect(screen.getByRole('combobox', { name: 'Filtrer par école' })).toHaveValue('A')
})
