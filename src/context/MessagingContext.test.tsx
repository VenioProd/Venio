import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import React from 'react'

// ─── Socket mock ────────────────────────────────────────────────────────────

interface MockSocket {
  on: (event: string, cb: (payload: unknown) => void) => void
  emit: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  connected: boolean
}

let lastSocket: MockSocket | null = null
const handlers = new Map<string, (payload: unknown) => void>()
const ioMock = vi.fn((_url: unknown, _opts?: unknown): MockSocket => {
  const socket: MockSocket = {
    on: vi.fn((event: string, cb: (payload: unknown) => void) => {
      handlers.set(event, cb)
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
  }
  lastSocket = socket
  return socket
})

vi.mock('socket.io-client', () => ({
  io: (url: unknown, opts?: unknown) => ioMock(url, opts),
}))

// Services mocks
vi.mock('@/services/messaging', () => ({
  fetchConversations: vi.fn(async () => [
    { _id: 'c1', participants: [], unreadCount: 0, lastMessageAt: null },
    { _id: 'c2', participants: [], unreadCount: 0, lastMessageAt: null },
  ]),
  fetchMessages: vi.fn(async () => []),
  markConversationRead: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => ({ _id: 'm1', conversation: 'c1', content: 'hi' })),
}))

import { MessagingProvider, useMessaging } from '@/context/MessagingContext'
import { setToken } from '@/lib/api'

function Probe({ onCtx }: { onCtx?: (ctx: ReturnType<typeof useMessaging>) => void }) {
  const ctx = useMessaging()
  React.useEffect(() => { onCtx?.(ctx) })
  return (
    <div>
      <span data-testid="active">{ctx.activeConversationId ?? 'none'}</span>
      <span data-testid="conv-count">{ctx.conversations.length}</span>
      <button onClick={() => ctx.setActiveConversationId('c2')}>switch</button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  handlers.clear()
  ioMock.mockClear()
  lastSocket = null
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MessagingProvider — socket lifecycle (fix #23)', () => {
  it('creates the socket exactly ONCE on mount', async () => {
    setToken('jwt')
    render(
      <MessagingProvider>
        <Probe />
      </MessagingProvider>
    )
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1))
  })

  it('does NOT create a socket when no token is present', async () => {
    render(
      <MessagingProvider>
        <Probe />
      </MessagingProvider>
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(ioMock).not.toHaveBeenCalled()
  })

  it('does NOT re-create the socket when activeConversationId changes', async () => {
    setToken('jwt')
    let api: ReturnType<typeof useMessaging> | null = null
    render(
      <MessagingProvider>
        <Probe onCtx={(ctx) => { api = ctx }} />
      </MessagingProvider>
    )
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api).not.toBeNull())

    await act(async () => {
      api!.setActiveConversationId('c2')
    })
    // Wait a tick and re-check — must still be 1 call
    await new Promise((r) => setTimeout(r, 10))
    expect(ioMock).toHaveBeenCalledTimes(1)
  })

  it('emits conversation:join and conversation:leave when active conversation changes', async () => {
    setToken('jwt')
    let api: ReturnType<typeof useMessaging> | null = null
    render(
      <MessagingProvider>
        <Probe onCtx={(ctx) => { api = ctx }} />
      </MessagingProvider>
    )
    await waitFor(() => expect(ioMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api).not.toBeNull())

    await act(async () => {
      api!.setActiveConversationId('c2')
    })

    await waitFor(() => {
      const emits = lastSocket!.emit.mock.calls.map((c) => c[0])
      expect(emits).toContain('conversation:join')
    })
  })

  it('passes the token to socket.io via auth', async () => {
    setToken('my.token')
    render(
      <MessagingProvider>
        <Probe />
      </MessagingProvider>
    )
    await waitFor(() => expect(ioMock).toHaveBeenCalled())
    const call = ioMock.mock.calls[0] as unknown as [unknown, { auth: { token: string } }]
    expect(call[1].auth.token).toBe('my.token')
  })
})

describe('MessagingProvider — initial conversation fetch', () => {
  it('loads the conversation list and auto-picks the first one as active', async () => {
    setToken('jwt')
    render(
      <MessagingProvider>
        <Probe />
      </MessagingProvider>
    )
    await waitFor(() => {
      expect(document.querySelector('[data-testid="conv-count"]')!.textContent).toBe('2')
      expect(document.querySelector('[data-testid="active"]')!.textContent).toBe('c1')
    })
  })
})

describe('MessagingProvider — message:created handler', () => {
  it('appends a message to the active conversation', async () => {
    setToken('jwt')
    let api: ReturnType<typeof useMessaging> | null = null
    render(
      <MessagingProvider>
        <Probe onCtx={(ctx) => { api = ctx }} />
      </MessagingProvider>
    )
    await waitFor(() => expect(handlers.has('message:created')).toBe(true))
    await waitFor(() => expect(api).not.toBeNull())

    await act(async () => {
      handlers.get('message:created')!({
        message: { _id: 'm1', conversation: 'c1', content: 'hi', createdAt: new Date().toISOString() },
      })
    })

    await waitFor(() => {
      expect(api!.messages.some((m) => m._id === 'm1')).toBe(true)
    })
  })
})
