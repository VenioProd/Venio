/**
 * Cache mémoire pour le flux ICS Apple Calendar.
 *
 * Pourquoi : fetcher l'URL iCloud à chaque requête HTTP de Raphael serait
 * inutile (le flux change peu et iCloud n'apprécie pas le martèlement).
 * On garde donc le contenu brut en mémoire avec un TTL configurable.
 *
 * L'expiration n'est pas un timer : on contrôle la fraîcheur à chaque
 * accès. Plus simple, et pas d'effet de bord en environnement de test.
 */

export interface IcsFetchResult {
  body: string
  fetchedAt: Date
  fromCache: boolean
}

export interface CacheStore {
  body: string
  fetchedAt: number
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

export interface IcsCacheOptions {
  ttlMs?: number
  now?: () => number
  fetcher?: Fetcher
}

const DEFAULT_TTL_MS = 15 * 60 * 1000

export class IcsCache {
  private store: CacheStore | null = null
  private inflight: Promise<IcsFetchResult> | null = null
  private ttlMs: number
  private now: () => number
  private fetcher: Fetcher

  constructor(opts: IcsCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
    this.now = opts.now ?? (() => Date.now())
    this.fetcher =
      opts.fetcher ??
      ((url) => globalThis.fetch(url, { redirect: 'follow' }))
  }

  isFresh(): boolean {
    if (!this.store) return false
    return this.now() - this.store.fetchedAt < this.ttlMs
  }

  getCached(): IcsFetchResult | null {
    if (!this.store) return null
    return {
      body: this.store.body,
      fetchedAt: new Date(this.store.fetchedAt),
      fromCache: true,
    }
  }

  invalidate(): void {
    this.store = null
  }

  /**
   * Retourne le flux ICS. Si une valeur fraîche est en cache et que `force`
   * vaut false, renvoie le cache. Sinon télécharge l'URL en partageant la
   * promesse pour éviter les fetchs concurrents.
   */
  async get(url: string, force = false): Promise<IcsFetchResult> {
    if (!force && this.isFresh()) {
      return this.getCached()!
    }
    if (this.inflight) {
      return this.inflight
    }
    this.inflight = (async () => {
      try {
        const resp = await this.fetcher(url)
        if (!resp.ok) {
          throw new Error(`Apple Calendar ICS fetch a échoué (${resp.status})`)
        }
        const body = await resp.text()
        const fetchedAt = this.now()
        this.store = { body, fetchedAt }
        return { body, fetchedAt: new Date(fetchedAt), fromCache: false }
      } finally {
        this.inflight = null
      }
    })()
    return this.inflight
  }
}

// ───────────────────────── Singleton applicatif ────────────────────────────

let singleton: IcsCache | null = null

export function getDefaultCache(): IcsCache {
  if (!singleton) {
    const ttlEnv = Number(process.env.EDUCATION_APPLE_CALENDAR_TTL_MS)
    singleton = new IcsCache({
      ttlMs: Number.isFinite(ttlEnv) && ttlEnv > 0 ? ttlEnv : DEFAULT_TTL_MS,
    })
  }
  return singleton
}

export function resetDefaultCache(): void {
  singleton = null
}
