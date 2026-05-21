import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Wraps `React.lazy` with two safety nets that prevent a fully black page
 * after a redeploy: the user has the old index.html in memory but the
 * hashed chunk files referenced by it have been replaced on the server.
 *
 * 1. Retries the dynamic import once after a short delay (transient
 *    network blips on resume from background often clear on retry).
 * 2. If the failure looks like a chunk-load error, force a hard reload
 *    so the browser pulls a fresh index.html (new chunk hashes). A
 *    sessionStorage flag guards against an infinite reload loop when
 *    the chunk is genuinely broken.
 */
const RELOAD_FLAG = 'venio:chunk-reload-attempted'

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const message = (err as { message?: string }).message || String(err)
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory()
      // Successful load → clear the guard so a future failure can reload.
      try { window.sessionStorage.removeItem(RELOAD_FLAG) } catch { /* noop */ }
      return mod
    } catch (err) {
      if (isChunkLoadError(err)) {
        let alreadyReloaded = false
        try { alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG) === '1' } catch { /* noop */ }

        if (!alreadyReloaded) {
          try { window.sessionStorage.setItem(RELOAD_FLAG, '1') } catch { /* noop */ }
          // Hard reload to fetch a fresh index.html with current chunk hashes.
          window.location.reload()
          // Return a never-resolving promise so React keeps Suspense
          // pending until the page swaps.
          return new Promise<{ default: T }>(() => {})
        }
      }
      throw err
    }
  })
}
