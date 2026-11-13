import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  AUDIO_CACHE_MAX_BYTES,
  AUDIO_CACHE_TTL_MS,
  cachedAudio,
  dropCachedAudio,
  resetAudioCache,
} from '../lib/recordingAudioCache.js'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-13T10:00:00Z') })
  resetAudioCache()
})
afterEach(() => vi.useRealTimers())

const audio = (size = 10) => Buffer.alloc(size, 1)

it('lit une fois pour des plages simultanées, puis depuis la mémoire', async () => {
  const load = vi.fn(async () => audio())
  await Promise.all([cachedAudio('c1', 'RE1', load), cachedAudio('c1', 'RE1', load)])
  await cachedAudio('c1', 'RE1', load)
  expect(load).toHaveBeenCalledTimes(1)
  await cachedAudio('c1', 'RE2', load)
  expect(load).toHaveBeenCalledTimes(2)
})

it('expire après la durée bornée et se vide à l’effacement, même pendant une lecture en cours', async () => {
  const load = vi.fn(async () => audio())
  await cachedAudio('c1', 'RE1', load)
  vi.advanceTimersByTime(AUDIO_CACHE_TTL_MS + 1)
  await cachedAudio('c1', 'RE1', load)
  expect(load).toHaveBeenCalledTimes(2)

  dropCachedAudio('c1')
  await cachedAudio('c1', 'RE1', load)
  expect(load).toHaveBeenCalledTimes(3)

  // Effacé pendant la lecture : cette requête est servie, rien n'est gardé.
  dropCachedAudio('c1')
  let release!: (value: Buffer) => void
  const slow = vi.fn(() => new Promise<Buffer>((resolve) => (release = resolve)))
  const pending = cachedAudio('c1', 'RE1', slow)
  dropCachedAudio('c1')
  release(audio())
  await pending
  await cachedAudio('c1', 'RE1', load)
  expect(load).toHaveBeenCalledTimes(4)
})

it('reste sous la taille bornée : évince le moins récemment lu, ne garde pas un audio trop gros', async () => {
  const half = AUDIO_CACHE_MAX_BYTES / 2
  const load = (size: number) => vi.fn(async () => Buffer.alloc(size, 1))
  const [a, b, c, big] = [load(half), load(half), load(half), load(AUDIO_CACHE_MAX_BYTES + 1)]
  await cachedAudio('a', 'R', a)
  await cachedAudio('b', 'R', b)
  await cachedAudio('a', 'R', a) // a redevient le plus récent
  await cachedAudio('c', 'R', c) // b est évincé
  await cachedAudio('a', 'R', a)
  await cachedAudio('b', 'R', b)
  expect([a.mock.calls.length, b.mock.calls.length, c.mock.calls.length]).toEqual([1, 2, 1])
  await cachedAudio('big', 'R', big)
  await cachedAudio('big', 'R', big)
  expect(big).toHaveBeenCalledTimes(2)
})
