import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const handlers = new Map<string, (payload: unknown) => void>()
const socketState = { connected: false }
const ioMock = vi.fn((_url: unknown, _opts?: unknown) => ({
  on: vi.fn((event: string, cb: (payload: unknown) => void) => {
    handlers.set(event, cb)
  }),
  emit: vi.fn(),
  disconnect: vi.fn(() => { socketState.connected = false }),
  get connected() { return socketState.connected },
}))

vi.mock('socket.io-client', () => ({
  io: (url: unknown, opts?: unknown) => ioMock(url, opts),
}))

vi.mock('@/services/notifications', () => ({
  fetchNotifications: vi.fn(async () => []),
  fetchUnreadCount: vi.fn(async () => 0),
  markAsRead: vi.fn(async () => undefined),
  markAllAsRead: vi.fn(async () => undefined),
}))

vi.mock('@/lib/appBadge', () => ({
  syncAppBadge: vi.fn(),
}))

// AuthContext mock — controllable user via setter
const authState: { user: { _id: string; email: string; name: string; role: string } | null } = { user: null }
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}))

// Import AFTER mocks
import { NotificationProvider, useNotifications } from '@/context/NotificationContext'
import { setToken } from '@/lib/api'

function Probe() {
  const { unreadCount, notifications } = useNotifications()
  return (
    <div>
      <span data-testid="count">{unreadCount}</span>
      <span data-testid="len">{notifications.length}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <MemoryRouter>
      <NotificationProvider>
        <Probe />
      </NotificationProvider>
    </MemoryRouter>
  )
}

beforeEach(async () => {
  window.localStorage.clear()
  handlers.clear()
  ioMock.mockClear()
  socketState.connected = false
  authState.user = null
  const services = await import('@/services/notifications')
  vi.mocked(services.fetchUnreadCount).mockClear()
  vi.mocked(services.fetchNotifications).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NotificationProvider — socket auth (fix #5)', () => {
  it('passes auth.token from getToken() (NOT localStorage.getItem("token"))', async () => {
    setToken('correct.auth_token')
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'SUPER_ADMIN' }

    // Verify wrong key would be empty (proves we don't accidentally read it).
    expect(window.localStorage.getItem('token')).toBeNull()

    renderProvider()

    await waitFor(() => expect(ioMock).toHaveBeenCalled())
    const call = ioMock.mock.calls[0] as unknown as [unknown, { auth: { token: string } }]
    expect(call[1].auth.token).toBe('correct.auth_token')
  })

  it('does NOT open a socket when user is null', async () => {
    setToken('x')
    authState.user = null
    renderProvider()
    // Wait a tick to be sure no async open happens
    await new Promise((r) => setTimeout(r, 0))
    expect(ioMock).not.toHaveBeenCalled()
  })

  it('does NOT open a socket when user is a CLIENT (not admin)', async () => {
    setToken('x')
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'CLIENT' }
    renderProvider()
    await new Promise((r) => setTimeout(r, 0))
    expect(ioMock).not.toHaveBeenCalled()
  })

  it('does NOT open a socket when token is missing', async () => {
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' }
    renderProvider()
    await new Promise((r) => setTimeout(r, 0))
    expect(ioMock).not.toHaveBeenCalled()
  })
})

describe('NotificationProvider — notification:new', () => {
  it('increments unreadCount and prepends the notification', async () => {
    setToken('jwt')
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' }
    renderProvider()
    await waitFor(() => expect(handlers.has('notification:new')).toBe(true))

    await act(async () => {
      handlers.get('notification:new')!({ _id: 'n1', title: 'Hello' })
    })

    await waitFor(() => {
      const count = document.querySelector('[data-testid="count"]')!.textContent
      const len = document.querySelector('[data-testid="len"]')!.textContent
      expect(count).toBe('1')
      expect(len).toBe('1')
    })
  })

  it('ignores duplicate notifications with same _id', async () => {
    setToken('jwt')
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' }
    renderProvider()
    await waitFor(() => expect(handlers.has('notification:new')).toBe(true))

    await act(async () => {
      handlers.get('notification:new')!({ _id: 'dup', title: 'a' })
      handlers.get('notification:new')!({ _id: 'dup', title: 'a' })
    })

    await waitFor(() => {
      expect(document.querySelector('[data-testid="len"]')!.textContent).toBe('1')
    })
  })
})

describe('NotificationProvider — polling fallback', () => {
  it('performs an initial refresh on mount for admins', async () => {
    setToken('jwt')
    authState.user = { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' }
    const services = await import('@/services/notifications')

    renderProvider()
    await waitFor(() => expect(services.fetchUnreadCount).toHaveBeenCalled())
    expect(services.fetchNotifications).toHaveBeenCalled()
  })

  it('does NOT refresh when user is a CLIENT', async () => {
    setToken('jwt')
    authState.user = { _id: '1', email: 'c@d.com', name: 'C', role: 'CLIENT' }
    const services = await import('@/services/notifications')

    renderProvider()
    // give it a beat
    await new Promise((r) => setTimeout(r, 10))
    expect(services.fetchUnreadCount).not.toHaveBeenCalled()
    expect(services.fetchNotifications).not.toHaveBeenCalled()
  })
})
