import { describe, it, expect, vi } from 'vitest'
import { IcsCache } from '../lib/appleCalendar/cache.js'

function makeFetcher(body: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => body,
  }))
}

describe('appleCalendar / cache', () => {
  it('fetches once then serves from cache while TTL is fresh', async () => {
    let nowMs = 1_700_000_000_000
    const fetcher = makeFetcher('ICS_BODY_v1')
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })

    const first = await cache.get('https://example.com/cal.ics')
    expect(first.fromCache).toBe(false)
    expect(first.body).toBe('ICS_BODY_v1')
    expect(fetcher).toHaveBeenCalledTimes(1)

    nowMs += 10_000
    const second = await cache.get('https://example.com/cal.ics')
    expect(second.fromCache).toBe(true)
    expect(second.body).toBe('ICS_BODY_v1')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetches once the TTL has expired', async () => {
    let nowMs = 1_700_000_000_000
    let body = 'v1'
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }))
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })

    await cache.get('https://example.com/cal.ics')
    expect(fetcher).toHaveBeenCalledTimes(1)

    nowMs += 120_000
    body = 'v2'
    const fresh = await cache.get('https://example.com/cal.ics')
    expect(fresh.fromCache).toBe(false)
    expect(fresh.body).toBe('v2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('force=true bypasses the cache even when fresh', async () => {
    const nowMs = 1_700_000_000_000
    let body = 'v1'
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => body,
    }))
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })
    await cache.get('https://example.com/cal.ics')
    expect(fetcher).toHaveBeenCalledTimes(1)
    body = 'v2'
    const forced = await cache.get('https://example.com/cal.ics', true)
    expect(forced.fromCache).toBe(false)
    expect(forced.body).toBe('v2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('coalesces concurrent fetches into a single network call', async () => {
    const nowMs = 1_700_000_000_000
    let resolveFetch: (v: { ok: boolean; status: number; text: () => Promise<string> }) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<{ ok: boolean; status: number; text: () => Promise<string> }>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })

    const p1 = cache.get('https://example.com/cal.ics')
    const p2 = cache.get('https://example.com/cal.ics')
    expect(fetcher).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: true, status: 200, text: async () => 'BODY' })
    const [a, b] = await Promise.all([p1, p2])
    expect(a.body).toBe('BODY')
    expect(b.body).toBe('BODY')
  })

  it('propagates non-2xx HTTP errors and does not poison the cache', async () => {
    const nowMs = 1_700_000_000_000
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }))
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })

    await expect(cache.get('https://example.com/cal.ics')).rejects.toThrow(/503/)
    // Next call should retry, not return a stale poisoned cache.
    const fetcherOk = makeFetcher('ok')
    const cache2 = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher: fetcherOk })
    const ok = await cache2.get('https://example.com/cal.ics')
    expect(ok.body).toBe('ok')
  })

  it('invalidate() forces the next call to refetch', async () => {
    const nowMs = 1_700_000_000_000
    let body = 'v1'
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => body }))
    const cache = new IcsCache({ ttlMs: 60_000, now: () => nowMs, fetcher })
    await cache.get('https://example.com/cal.ics')
    expect(fetcher).toHaveBeenCalledTimes(1)
    cache.invalidate()
    body = 'v2'
    const fresh = await cache.get('https://example.com/cal.ics')
    expect(fresh.body).toBe('v2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
