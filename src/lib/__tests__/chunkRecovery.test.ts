import { describe, expect, it, vi } from 'vitest'
import { recoverChunkError } from '../chunkRecovery'

describe('chunk recovery', () => {
  it('reloads a missing chunk only once per tab, including failures in other chunks', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const reload = vi.fn()
    expect(
      recoverChunkError(new Error('Failed to fetch dynamically imported module /a.js'), () => storage, reload),
    ).toBe(true)
    expect(
      recoverChunkError(new Error('Failed to fetch dynamically imported module /b.js'), () => storage, reload),
    ).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })
  it('does not automatically reload ordinary errors or when storage is unavailable', () => {
    const reload = vi.fn()
    const unavailable = () => {
      throw new Error('storage unavailable')
    }
    expect(recoverChunkError(new Error('programming error'), unavailable, reload)).toBe(false)
    expect(recoverChunkError(new Error('ChunkLoadError'), unavailable, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
