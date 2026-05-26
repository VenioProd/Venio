import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  apiFetch,
  apiDownload,
  apiUpload,
  getToken,
  setToken,
} from '@/lib/api'

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean; contentType?: string } = {}) {
  const status = init.status ?? 200
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    headers: new Headers({ 'content-type': init.contentType ?? 'application/json' }),
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  } as unknown as Response
}

function blobResponse(blob: Blob, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': blob.type || 'application/octet-stream', ...headers }),
    json: async () => ({}),
    blob: async () => blob,
  } as unknown as Response
}

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_LOCATION = window.location

beforeEach(() => {
  // Always start from a fresh, real jsdom localStorage.
  window.localStorage.clear()
})

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
  // Restore window.location if it was overridden by a test.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: ORIGINAL_LOCATION,
  })
})

// ─── getToken / setToken ────────────────────────────────────────────────────

describe('getToken / setToken', () => {
  it('getToken returns null when no token in localStorage', () => {
    expect(getToken()).toBeNull()
  })

  it('setToken writes to the auth_token key in localStorage', () => {
    setToken('abc.def.ghi')
    expect(window.localStorage.getItem('auth_token')).toBe('abc.def.ghi')
  })

  it('getToken reads from the auth_token key', () => {
    window.localStorage.setItem('auth_token', 'jwt.token')
    expect(getToken()).toBe('jwt.token')
  })

  it('setToken(null) removes the token', () => {
    window.localStorage.setItem('auth_token', 'jwt.token')
    setToken(null)
    expect(window.localStorage.getItem('auth_token')).toBeNull()
  })

  it('does NOT use the legacy "token" key (bug fix #5)', () => {
    setToken('xxx')
    expect(window.localStorage.getItem('token')).toBeNull()
    expect(window.localStorage.getItem('auth_token')).toBe('xxx')
  })
})

// ─── ApiError ───────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('exposes status, message and payload', () => {
    const err = new ApiError(404, 'not found', { detail: 'x' })
    expect(err.status).toBe(404)
    expect(err.message).toBe('not found')
    expect(err.payload).toEqual({ detail: 'x' })
    expect(err.name).toBe('ApiError')
    expect(err).toBeInstanceOf(Error)
  })
})

// ─── apiFetch — success path ────────────────────────────────────────────────

describe('apiFetch', () => {
  it('adds Content-Type: application/json by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    global.fetch = fetchMock as unknown as typeof fetch
    await apiFetch('/api/foo')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('adds Authorization header when a token is set', async () => {
    setToken('jwt.xyz')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    global.fetch = fetchMock as unknown as typeof fetch
    await apiFetch('/api/me')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt.xyz')
  })

  it('does NOT add Authorization header when no token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    global.fetch = fetchMock as unknown as typeof fetch
    await apiFetch('/api/public')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('parses JSON response on success', async () => {
    const body = { id: 1, name: 'Alice' }
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(body)) as unknown as typeof fetch
    const data = await apiFetch<{ id: number; name: string }>('/api/users/1')
    expect(data).toEqual(body)
  })

  it('returns null when response has no JSON content-type', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(null, { contentType: 'text/plain' })) as unknown as typeof fetch
    const data = await apiFetch('/api/health')
    expect(data).toBeNull()
  })

  it('preserves caller-supplied headers and method', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    global.fetch = fetchMock as unknown as typeof fetch
    await apiFetch('/api/foo', { method: 'POST', headers: { 'X-Trace': 'abc' }, body: JSON.stringify({ a: 1 }) })
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['X-Trace']).toBe('abc')
  })
})

// ─── apiFetch — error paths ─────────────────────────────────────────────────

describe('apiFetch error handling', () => {
  it('throws ApiError on 4xx with parsed message', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'Validation failed' }, { status: 422 })) as unknown as typeof fetch
    await expect(apiFetch('/api/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      message: 'Validation failed',
    })
  })

  it('throws ApiError on 5xx with fallback message', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 500 })) as unknown as typeof fetch
    await expect(apiFetch('/api/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Erreur serveur',
    })
  })

  it('propagates network errors (rejected fetch)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch
    await expect(apiFetch('/api/x')).rejects.toThrow('Failed to fetch')
  })
})

// ─── 401 handler — the Wave 1 fix ───────────────────────────────────────────

describe('apiFetch 401 handler', () => {
  function setPathname(pathname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...ORIGINAL_LOCATION, pathname, href: `http://localhost${pathname}` },
    })
  }

  it('emits a CustomEvent auth:unauthorized on /admin path', async () => {
    setPathname('/admin/dashboard')
    setToken('to.be.cleared')
    const listener = vi.fn()
    window.addEventListener('auth:unauthorized', listener)

    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'expired' }, { status: 401 })) as unknown as typeof fetch

    await expect(apiFetch('/api/admin/me')).rejects.toBeInstanceOf(ApiError)

    expect(listener).toHaveBeenCalledTimes(1)
    const ev = listener.mock.calls[0]![0] as CustomEvent<{ scope: string }>
    expect(ev.detail.scope).toBe('admin')

    window.removeEventListener('auth:unauthorized', listener)
  })

  it('emits scope=client on /espace-client path', async () => {
    setPathname('/espace-client/projects')
    setToken('x')
    const listener = vi.fn()
    window.addEventListener('auth:unauthorized', listener)

    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 401 })) as unknown as typeof fetch

    await expect(apiFetch('/api/foo')).rejects.toBeInstanceOf(ApiError)
    const ev = listener.mock.calls[0]![0] as CustomEvent<{ scope: string }>
    expect(ev.detail.scope).toBe('client')

    window.removeEventListener('auth:unauthorized', listener)
  })

  it('clears the token on 401', async () => {
    setPathname('/admin/dashboard')
    setToken('to.be.cleared')
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 401 })) as unknown as typeof fetch
    await expect(apiFetch('/api/foo')).rejects.toBeInstanceOf(ApiError)
    expect(getToken()).toBeNull()
  })

  it('does NOT change window.location.href (no hard reload — fix Wave 1)', async () => {
    setPathname('/admin/dashboard')
    setToken('x')
    const originalHref = window.location.href
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 401 })) as unknown as typeof fetch
    await expect(apiFetch('/api/foo')).rejects.toBeInstanceOf(ApiError)
    expect(window.location.href).toBe(originalHref)
  })

  it('does NOT trigger the handler on /auth/login (401 is expected there)', async () => {
    setPathname('/admin/login')
    setToken('still.valid.maybe')
    const listener = vi.fn()
    window.addEventListener('auth:unauthorized', listener)
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'bad creds' }, { status: 401 })) as unknown as typeof fetch
    await expect(apiFetch('/api/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()
    // Token should NOT be cleared on login attempts
    expect(getToken()).toBe('still.valid.maybe')
    window.removeEventListener('auth:unauthorized', listener)
  })

  it('does NOT emit on 401 outside /admin or /espace-client', async () => {
    setPathname('/contact')
    const listener = vi.fn()
    window.addEventListener('auth:unauthorized', listener)
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 401 })) as unknown as typeof fetch
    await expect(apiFetch('/api/something')).rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener('auth:unauthorized', listener)
  })
})

// ─── apiUpload ──────────────────────────────────────────────────────────────

describe('apiUpload', () => {
  it('does NOT set Content-Type (browser must add multipart boundary)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ url: '/x' }))
    global.fetch = fetchMock as unknown as typeof fetch
    const fd = new FormData()
    fd.append('file', new Blob(['hi']), 'a.txt')
    await apiUpload('/api/upload', fd)
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('adds Authorization when token is present', async () => {
    setToken('upload.token')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    global.fetch = fetchMock as unknown as typeof fetch
    await apiUpload('/api/upload', new FormData())
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer upload.token')
  })

  it('throws ApiError on upload failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'too big' }, { status: 413 })) as unknown as typeof fetch
    await expect(apiUpload('/api/upload', new FormData())).rejects.toMatchObject({
      status: 413,
      message: 'too big',
    })
  })
})

// ─── apiDownload ────────────────────────────────────────────────────────────

describe('apiDownload', () => {
  it('returns the blob + parsed filename + content-type', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    global.fetch = vi
      .fn()
      .mockResolvedValue(blobResponse(blob, { 'content-disposition': 'attachment; filename="hello.txt"' })) as unknown as typeof fetch
    const res = await apiDownload('/api/files/1')
    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.filename).toBe('hello.txt')
    expect(res.contentType).toBe('text/plain')
  })

  it('decodes RFC 5987 UTF-8 filenames', async () => {
    const blob = new Blob([''], { type: 'application/pdf' })
    global.fetch = vi
      .fn()
      .mockResolvedValue(blobResponse(blob, { 'content-disposition': "attachment; filename*=UTF-8''facture%20%C3%A9t%C3%A9.pdf" })) as unknown as typeof fetch
    const res = await apiDownload('/api/files/2')
    expect(res.filename).toBe('facture été.pdf')
  })

  it('returns null filename when no content-disposition', async () => {
    const blob = new Blob([''], { type: 'application/pdf' })
    global.fetch = vi.fn().mockResolvedValue(blobResponse(blob)) as unknown as typeof fetch
    const res = await apiDownload('/api/files/3')
    expect(res.filename).toBeNull()
  })

  it('throws ApiError on failed download', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'forbidden' }, { status: 403 })) as unknown as typeof fetch
    await expect(apiDownload('/api/files/4')).rejects.toMatchObject({
      status: 403,
      message: 'forbidden',
    })
  })
})
