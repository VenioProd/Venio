import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { isChunkLoadError, recoverChunkError } from './chunkRecovery'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      if (!isChunkLoadError(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 250))
      try {
        return await factory()
      } catch (retryError) {
        if (recoverChunkError(retryError)) return new Promise<{ default: T }>(() => {})
        throw retryError
      }
    }
  })
}
