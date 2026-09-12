export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  )
}

/** One automatic reload per tab. Other lazy chunks must not clear this guard. */
export function recoverChunkError(
  error: unknown,
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.sessionStorage,
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    const storage = getStorage()
    const key = 'venio:chunk-reload-attempted'
    if (storage.getItem(key)) return false
    storage.setItem(key, '1')
    reload()
    return true
  } catch {
    // With unavailable storage, a manual retry is safer than a reload loop.
    return false
  }
}
