import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CalendarEventWorkspaceDrawer } from './CalendarEventWorkspaceDrawer'
import { fetchCalendarEventWorkspace, updateCalendarEventWorkspace } from '../../../services/educationCalendar'
import { useEducationAutosave } from './useEducationAutosave'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { ClassWorkspace } from './ClassWorkspace'
import { getClass, getClassHome, getSession, updateClass, updateSession } from '../../../services/education'

vi.mock('../../../services/education', async (original) => ({
  ...(await original<typeof import('../../../services/education')>()),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  getClass: vi.fn(),
  getClassHome: vi.fn(),
  updateClass: vi.fn(),
  updateNote: vi.fn().mockResolvedValue({ note: {} }),
}))
vi.mock('../../../services/educationCalendar', () => ({
  fetchCalendarEventWorkspace: vi.fn(),
  updateCalendarEventWorkspace: vi.fn(),
}))
vi.mock('./DocumentsPanel', () => ({ DocumentsPanel: () => null }))
vi.mock('./EducationAiDraft', () => ({ EducationAiDraftPanel: () => null }))
vi.mock('./PostSessionFlow', () => ({ PostSessionFlow: () => null }))
vi.mock('./NoteEditor', () => ({ NoteEditor: () => null }))

const owner = vi.hoisted(() => ({ id: 0 }))
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: `autosave-test-${owner.id}` } }) }))
beforeEach(() => {
  owner.id++
  localStorage.clear()
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('regression: closing a session just after typing should save the last recap', async () => {
  vi.mocked(getSession).mockResolvedValue({
    session: {
      _id: 's1',
      title: 'Test',
      classId: 'c1',
      date: '2026-09-12',
      durationMinutes: 60,
      status: 'PLANIFIEE',
      recap: '',
      attendance: [],
    },
  } as never)
  vi.mocked(updateSession).mockResolvedValue({ session: {} } as never)
  const view = render(<SessionDetailDrawer sessionId="s1" onClose={() => view.unmount()} onChanged={() => {}} />)
  await act(async () => {})
  fireEvent.change(screen.getByLabelText('Compte-rendu de séance'), { target: { value: 'Last important note' } })
  view.unmount()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(updateSession).toHaveBeenCalledWith('s1', { recap: 'Last important note' })
})

it('regression: changing name and level within 500ms should persist both fields', async () => {
  vi.mocked(getClass).mockResolvedValue({
    class: {
      _id: 'c1',
      name: 'Original',
      school: 'School',
      level: 'M1',
      program: '',
      status: 'ACTIVE',
      color: '#22C55E',
      tags: [],
      properties: [],
      period: { start: null, end: null },
    },
    stats: null,
  } as never)
  vi.mocked(getClassHome).mockResolvedValue({ note: { _id: 'n1', title: '', blocks: [], links: [] } } as never)
  vi.mocked(updateClass).mockResolvedValue({ class: {} } as never)
  render(<ClassWorkspace classId="c1" onClose={() => {}} onChanged={() => {}} />)
  await act(async () => {})
  fireEvent.change(screen.getByLabelText('Nom de la classe'), { target: { value: 'New name' } })
  fireEvent.change(screen.getByPlaceholderText('BAC+1, M1…'), { target: { value: 'M2' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  const persisted = Object.assign({}, ...vi.mocked(updateClass).mock.calls.map((c) => c[1]))
  expect(persisted).toEqual(expect.objectContaining({ name: 'New name', level: 'M2' }))
})

it('serializes a new edit behind an in-flight save and retains the latest draft after failure', async () => {
  let release!: (value: never) => void
  vi.mocked(updateSession)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ session: {} } as never)
  const { result } = renderHook(() => useEducationAutosave())
  act(() => result.current.stage('session', 'slow', { recap: 'First' }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  act(() => result.current.stage('session', 'slow', { recap: 'Latest', agenda: 'Plan' }))
  expect(updateSession).toHaveBeenCalledTimes(1)
  await act(async () => {
    release({ session: {} } as never)
  })
  expect(result.current.status).toBe('error')
  expect(result.current.restore('session', 'slow', { recap: 'Old' })).toMatchObject({ recap: 'Latest', agenda: 'Plan' })
  expect(
    JSON.parse(localStorage.getItem(`venio:education-draft:autosave-test-${owner.id}:session:slow`)!),
  ).toMatchObject({ recap: 'Latest' })
  await act(async () => {
    expect(await result.current.flush()).toBe(true)
  })
  expect(updateSession).toHaveBeenLastCalledWith('slow', { recap: 'Latest', agenda: 'Plan' })
  expect(result.current.status).toBe('saved')
  expect(localStorage.getItem(`venio:education-draft:autosave-test-${owner.id}:session:slow`)).toBeNull()
})

it('restores an owner-scoped draft after reopening and never loads another owner’s draft', async () => {
  const key = `venio:education-draft:autosave-test-${owner.id}:note:restored`
  localStorage.setItem(key, JSON.stringify({ title: 'Recovered', blocks: [] }))
  const { result } = renderHook(() => useEducationAutosave())
  expect(result.current.restore('note', 'restored', { title: 'Server' }).title).toBe('Recovered')
  owner.id++
  const other = renderHook(() => useEducationAutosave())
  expect(other.result.current.restore('note', 'restored', { title: 'Other owner' }).title).toBe('Other owner')
})

it('flushes Apple course notes and the class association when closing immediately', async () => {
  vi.mocked(fetchCalendarEventWorkspace).mockResolvedValue({
    workspace: { notes: '', classId: null, remarks: [], links: [], reminders: [], duties: [] },
    exists: false,
  } as never)
  vi.mocked(updateCalendarEventWorkspace).mockResolvedValue({ workspace: {} } as never)
  const onClose = vi.fn()
  render(
    <CalendarEventWorkspaceDrawer
      event={
        {
          occurrenceId: 'evt-1',
          uid: 'uid-1',
          title: 'Course',
          start: '2026-09-12T09:00:00Z',
          end: '2026-09-12T10:00:00Z',
          durationMin: 60,
          source: 'Apple Calendar',
        } as never
      }
      onClose={onClose}
      classes={[{ _id: 'c1', name: 'Master', status: 'ACTIVE' } as never]}
    />,
  )
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Notes libres' }))
  fireEvent.change(screen.getByLabelText('Notes libres'), { target: { value: 'Last course note' } })
  fireEvent.change(screen.getByLabelText('Rattacher à une classe'), { target: { value: 'c1' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' })[0])
  await act(async () => {})
  expect(updateCalendarEventWorkspace).toHaveBeenCalledWith(
    expect.objectContaining({ occurrenceId: 'evt-1', notes: 'Last course note', classId: 'c1' }),
  )
  expect(onClose).toHaveBeenCalledOnce()
})
