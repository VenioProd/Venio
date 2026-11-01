import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotificationsCenter from './NotificationsCenter'
import { ToastProvider } from '../../context/ToastContext'
import * as api from '../../lib/api'
import * as service from '../../services/notifications'
import type { AppNotification } from '../../types/notification.types'

const refresh = vi.fn()
const markAllAsRead = vi.fn()
vi.mock('../../context/NotificationContext', () => ({
  useNotifications: () => ({ refresh, markAllAsRead, unreadCount: 0, notifications: [], markAsRead: vi.fn() }),
}))

const DAY = 24 * 60 * 60 * 1000
const make = (id: string, over: Partial<AppNotification> = {}): AppNotification => ({
  _id: id,
  recipient: 'me',
  type: 'TASK_ASSIGNED',
  title: `Rappel ${id}`,
  message: '',
  link: '',
  isRead: false,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
})

const list = [
  make('a', { isRead: true }),
  make('b'),
  make('c', { createdAt: new Date(Date.now() - 45 * DAY).toISOString() }),
]

function mount() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NotificationsCenter />
      </ToastProvider>
    </MemoryRouter>,
  )
}
const box = (id: string) => screen.getByRole('checkbox', { name: `Sélectionner Rappel ${id}` }) as HTMLInputElement

describe('NotificationsCenter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    refresh.mockReset()
    markAllAsRead.mockReset()
    vi.spyOn(service, 'fetchAllNotifications').mockResolvedValue({ notifications: list, total: 3 })
  })

  it('offers quick selection by filter and shows the bulk bar', async () => {
    mount()
    await screen.findByText('Rappel a')
    expect(screen.queryByRole('toolbar')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Les lues/ }))
    expect([box('a').checked, box('b').checked, box('c').checked]).toEqual([true, false, false])
    expect(screen.getByRole('toolbar', { name: 'Actions groupées' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Plus vieilles que 30 j/ }))
    expect([box('a').checked, box('b').checked, box('c').checked]).toEqual([false, false, true])

    fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner' }))
    expect([box('a').checked, box('b').checked, box('c').checked]).toEqual([true, true, true])
    expect(screen.getByText('3 sélectionnés')).toBeInTheDocument()
  })

  it('archives the selection through the bulk endpoint, then reloads the list and the bell', async () => {
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ succeeded: ['b'], failed: [] })
    mount()
    await screen.findByText('Rappel b')
    fireEvent.click(box('b'))
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('/api/admin/notifications/bulk')
    expect(JSON.parse(opts.body as string)).toEqual({ ids: ['b'], action: 'archive' })
    expect(opts.headers['Idempotency-Key']).toBeTruthy()
    expect(service.fetchAllNotifications).toHaveBeenCalledTimes(2)
  })

  it('marks as unread without confirmation but confirms before deleting', async () => {
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ succeeded: ['a'], failed: [] })
    mount()
    await screen.findByText('Rappel a')
    fireEvent.click(box('a'))
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme non lu' }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).action).toBe('unread')

    fireEvent.click(box('a'))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText(/Supprimer définitivement 1 élément/)).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('deletes read notifications after confirmation and marks everything as read', async () => {
    const del = vi.spyOn(service, 'deleteReadNotifications').mockResolvedValue(1)
    mount()
    await screen.findByText('Rappel a')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer les lues' }))
    expect(await screen.findByText(/Supprimer définitivement toutes vos notifications lues/)).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('active'))

    fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }))
    await waitFor(() => expect(markAllAsRead).toHaveBeenCalled())
  })

  it('switches to the archived view and offers to unarchive', async () => {
    mount()
    await screen.findByText('Rappel a')
    fireEvent.click(screen.getByRole('button', { name: 'Archivées' }))
    await waitFor(() => expect(service.fetchAllNotifications).toHaveBeenCalledWith('archived'))
    await screen.findByText('Rappel a')
    fireEvent.click(box('a'))
    expect(screen.getByRole('button', { name: 'Désarchiver' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archiver' })).toBeNull()
  })
})
