import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { getToken, setToken } from '@/lib/api'

const ORIGINAL_FETCH = global.fetch

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as unknown as Response
}

function Consumer() {
  const { user, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <button onClick={() => login('a@b.com', 'pw')}>do-login</button>
      <button onClick={() => logout()}>do-logout</button>
    </div>
  )
}

function LocationProbe() {
  // Simple element that's only rendered when navigation hits these routes.
  return null
}

function renderWithProvider(initialPath = '/admin/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <AuthProvider>
              <Consumer />
            </AuthProvider>
          }
        />
        <Route path="/admin/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('AuthProvider — initial load', () => {
  it('does not call /auth/me when no token is in storage', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('loads the user from /auth/me when token is present', async () => {
    setToken('valid.jwt')
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ user: { _id: '1', name: 'Alice', email: 'a@b.com', role: 'SUPER_ADMIN' } })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.com'))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer valid.jwt' }),
    }))
  })

  it('clears user + token when /auth/me fails', async () => {
    setToken('bad.jwt')
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, 401)) as unknown as typeof fetch
    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'))
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(getToken()).toBeNull()
  })
})

describe('AuthProvider — login / logout', () => {
  it('login() sets token and loads user', async () => {
    const fetchMock = vi
      .fn()
      // 1. /api/auth/login response
      .mockResolvedValueOnce(jsonResponse({ token: 'new.token', user: { _id: '1', email: 'a@b.com' } }))
      // 2. /api/auth/me response (loadUser)
      .mockResolvedValueOnce(jsonResponse({ user: { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' } }))
    global.fetch = fetchMock as unknown as typeof fetch

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('no'))

    await act(async () => {
      screen.getByText('do-login').click()
    })

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.com'))
    expect(getToken()).toBe('new.token')
  })

  it('logout() clears the token and the user', async () => {
    setToken('current.jwt')
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ user: { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' } })
    ) as unknown as typeof fetch

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.com'))

    await act(async () => {
      screen.getByText('do-logout').click()
    })

    expect(getToken()).toBeNull()
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('returns requires2FA without setting token when backend asks for 2FA', async () => {
    function TwoFAConsumer() {
      const { login } = useAuth()
      return (
        <button
          onClick={async () => {
            const res = await login('a@b.com', 'pw')
            const el = document.createElement('span')
            el.setAttribute('data-testid', 'result')
            el.textContent = res.requires2FA ? 'needs-2fa' : 'ok'
            document.body.appendChild(el)
          }}
        >
          go
        </button>
      )
    }
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ requires2FA: true })) as unknown as typeof fetch

    render(
      <MemoryRouter>
        <AuthProvider>
          <TwoFAConsumer />
        </AuthProvider>
      </MemoryRouter>
    )

    await act(async () => {
      screen.getByText('go').click()
    })

    await waitFor(() => expect(screen.getByTestId('result').textContent).toBe('needs-2fa'))
    expect(getToken()).toBeNull()
  })
})

describe('AuthProvider — auth:unauthorized event (fix #7)', () => {
  it('clears user and navigates to /admin/login on the custom event', async () => {
    setToken('jwt')
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ user: { _id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' } })
    ) as unknown as typeof fetch

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthProvider>
                <Consumer />
              </AuthProvider>
            }
          />
          <Route path="/admin/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.com'))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', { detail: { scope: 'admin' } })
      )
    })

    await waitFor(() => expect(screen.queryByTestId('login-page')).not.toBeNull())
  })

  it('navigates to /espace-client/login when scope=client', async () => {
    setToken('jwt')
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ user: { _id: '1', email: 'c@d.com', name: 'C', role: 'CLIENT' } })
    ) as unknown as typeof fetch

    render(
      <MemoryRouter initialEntries={['/espace-client/projects']}>
        <Routes>
          <Route
            path="*"
            element={
              <AuthProvider>
                <Consumer />
              </AuthProvider>
            }
          />
          <Route path="/espace-client/login" element={<div data-testid="client-login">client login</div>} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('c@d.com'))

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('auth:unauthorized', { detail: { scope: 'client' } })
      )
    })

    await waitFor(() => expect(screen.queryByTestId('client-login')).not.toBeNull())
  })
})

describe('useAuth outside provider', () => {
  it('throws a clear error', () => {
    function Lone() {
      useAuth()
      return null
    }
    // Suppress React error boundary log noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Lone />)).toThrow(/useAuth must be used within AuthProvider/)
    spy.mockRestore()
  })
})
