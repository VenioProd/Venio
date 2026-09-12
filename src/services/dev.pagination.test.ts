import { beforeEach, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api'
import { listDevIssues } from './dev'
vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
it('loads all 602 issues across pages and preserves filters and cancellation', async () => {
  const first = Array.from({ length: 500 }, (_, i) => ({ _id: String(i) }))
  const second = Array.from({ length: 102 }, (_, i) => ({ _id: String(i + 500) }))
  vi.mocked(apiFetch)
    .mockResolvedValueOnce({ issues: first, total: 602, nextPage: 2 })
    .mockResolvedValueOnce({ issues: second, total: 602, nextPage: null })
  const signal = new AbortController().signal
  expect((await listDevIssues({ project: 'p', blocked: 'true' }, signal)).issues).toHaveLength(602)
  const [url, options] = vi.mocked(apiFetch).mock.calls[1]
  expect(url).toContain('page=2')
  expect(url).toContain('project=p')
  expect(url).toContain('blocked=true')
  expect(options?.signal).toBe(signal)
})
it('never reports an incomplete page set as success', async () => {
  vi.mocked(apiFetch)
    .mockResolvedValueOnce({ issues: [{ _id: 'one' }], total: 2, nextPage: 2 })
    .mockRejectedValueOnce(new Error('offline'))
  await expect(listDevIssues()).rejects.toThrow('offline')
  vi.mocked(apiFetch).mockResolvedValueOnce({ issues: [{ _id: 'one' }], total: 2, nextPage: null })
  await expect(listDevIssues()).rejects.toThrow('liste complète')
})
