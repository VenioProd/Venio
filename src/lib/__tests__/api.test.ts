import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDownload, apiFetch, apiUpload, filenameFromContentDisposition } from '../api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('sends JSON requests with same-origin credentials and returns the parsed payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch<{ ok: boolean }>('/api/example', { method: 'POST', body: JSON.stringify({ name: 'Venio' }) }),
    ).resolves.toEqual({
      ok: true,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({ credentials: 'same-origin', method: 'POST', body: JSON.stringify({ name: 'Venio' }) }),
    )
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('honors explicit credential options for cookie-free public endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/public/analytics/event', {
      method: 'POST',
      body: JSON.stringify({ event: 'page_view' }),
      credentials: 'omit',
      keepalive: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect(init.keepalive).toBe(true)
  })

  it('retains the status, message and JSON payload in ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Accès refusé', reason: 'missing-role' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(apiFetch('/api/protected')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Accès refusé',
      payload: { error: 'Accès refusé', reason: 'missing-role' },
    })
  })

  it('does not force a JSON content type for multipart uploads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ uploaded: true }), { headers: { 'content-type': 'application/json' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const formData = new FormData()
    formData.append('file', new Blob(['content'], { type: 'text/plain' }), 'note.txt')

    await expect(apiUpload('/api/upload', formData)).resolves.toEqual({ uploaded: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new Headers(init.headers).has('content-type')).toBe(false)
    expect(init.body).toBe(formData)
    expect(init.credentials).toBe('same-origin')
  })

  it('uses the RFC 5987 filename and sanitizes unsafe path characters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('content', {
          headers: {
            'content-type': 'text/plain',
            'content-disposition':
              "attachment; filename=ignored.txt; filename*=UTF-8''..%2Ffacture%20%C3%A9t%C3%A9.txt",
          },
        }),
      ),
    )

    const result = await apiDownload('/api/file')

    expect(result.filename).toBe('facture été.txt')
    expect(result.contentType).toBe('text/plain')
    await expect(result.blob.text()).resolves.toBe('content')
  })

  it('handles quoted filenames containing semicolons and rejects unsafe empty names', () => {
    expect(filenameFromContentDisposition('attachment; filename="budget; final.pdf"')).toBe('budget; final.pdf')
    expect(filenameFromContentDisposition('attachment; filename="../.."')).toBeNull()
  })

  it('retains non-JSON download errors as their payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Service indisponible', { status: 503 })))

    await expect(apiDownload('/api/file')).rejects.toMatchObject({
      status: 503,
      message: 'Service indisponible',
      payload: 'Service indisponible',
    })
  })

  it('redirects an expired admin session to the MFA enrollment flow once', async () => {
    const replace = vi.fn()
    vi.stubGlobal('window', {
      location: {
        pathname: '/admin/comptabilite',
        search: '?periode=2026',
        replace,
      },
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant de continuer.' }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          ),
        ),
    )

    await expect(apiFetch('/api/admin/accounting/entries')).rejects.toMatchObject({
      status: 403,
      message: 'Configurez la MFA avant de continuer.',
    })
    expect(replace).toHaveBeenCalledWith('/admin/mfa-setup?returnTo=%2Fadmin%2Fcomptabilite%3Fperiode%3D2026')
  })
})
