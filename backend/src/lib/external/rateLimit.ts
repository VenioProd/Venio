/**
 * Rate-limit partagé pour les sources externes et les tokens agent.
 *
 * Implémente une fenêtre glissante d'1 minute par clé. Deux backends :
 *
 *  1. Redis (recommandé en prod / multi-instances) : compteur atomique
 *     INCR + EXPIRE. Le quota est cohérent même avec plusieurs replicas.
 *  2. In-memory (fallback de dev) : `Map` locale au process. Si REDIS_URL
 *     n'est pas défini, on émet un warning au boot et on utilise ce mode
 *     pour ne pas bloquer le démarrage local.
 *
 * L'API `consume` reste async dans les deux modes pour homogénéiser le
 * code appelant : les middlewares ont été migrés en `await`.
 *
 * Variables d'env :
 *   - REDIS_URL    : URL `redis://...` ou `rediss://...`. Si absent → mode
 *                    in-memory (warning au boot).
 *
 * Pour les tests/admin : `resetForSource(id)` purge le compteur d'une clé.
 */
import type { Redis as RedisClient } from 'ioredis'

const WINDOW_MS = 60 * 1000
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000)

export interface ConsumeResult {
  ok: boolean
  retryAfter: number
  remaining: number
}

interface Bucket {
  windowStart: number
  count: number
}

const buckets: Map<string, Bucket> = new Map()
let redis: RedisClient | null = null
let redisWarned = false

async function getRedis(): Promise<RedisClient | null> {
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) {
    if (!redisWarned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[rate-limit] REDIS_URL absent — fallback in-memory (mono-process). ' +
          'Pour un déploiement multi-instances, configurez REDIS_URL.'
      )
      redisWarned = true
    }
    return null
  }
  try {
    // ioredis a un default ESM ET un export nommé Redis ; on accepte les deux
    // shapes pour rester compatible avec les évolutions du package.
    const mod = (await import('ioredis')) as unknown as {
      Redis?: typeof import('ioredis').Redis
      default?: typeof import('ioredis').Redis
    }
    const IORedis = mod.Redis ?? mod.default
    if (!IORedis) {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] ioredis constructor introuvable, fallback in-memory')
      return null
    }
    const client = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    })
    client.on('error', (err: Error) => {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] Redis error:', err.message)
    })
    redis = client
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[rate-limit] Impossible de charger ioredis, fallback in-memory:', (err as Error).message)
  }
  return redis
}

function consumeInMemory(key: string, max: number): ConsumeResult {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { windowStart: now, count: 0 }
    buckets.set(key, bucket)
  }
  if (bucket.count >= max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000))
    return { ok: false, retryAfter, remaining: 0 }
  }
  bucket.count += 1
  return { ok: true, retryAfter: 0, remaining: Math.max(0, max - bucket.count) }
}

async function consumeRedis(
  client: RedisClient,
  key: string,
  max: number
): Promise<ConsumeResult> {
  // Bucket aligné sur une fenêtre fixe d'1 minute (clé suffixée par le minute-stamp).
  // Plus simple et plus robuste qu'un sliding window pur côté serveur.
  const windowKey = `rl:${key}:${Math.floor(Date.now() / WINDOW_MS)}`
  // Pipeline atomique : INCR puis EXPIRE.
  const pipeline = client.multi()
  pipeline.incr(windowKey)
  pipeline.expire(windowKey, WINDOW_SEC)
  const results = await pipeline.exec()
  if (!results || !results[0] || results[0][0]) {
    // Erreur Redis : fail-open (on laisse passer) pour ne pas casser la prod.
    return { ok: true, retryAfter: 0, remaining: max }
  }
  const count = Number(results[0][1]) || 0
  if (count > max) {
    const retryAfter = WINDOW_SEC - (Math.floor(Date.now() / 1000) % WINDOW_SEC)
    return { ok: false, retryAfter: Math.max(1, retryAfter), remaining: 0 }
  }
  return { ok: true, retryAfter: 0, remaining: Math.max(0, max - count) }
}

/**
 * Tente de consommer 1 token pour la source donnée.
 */
export async function consume(sourceId: unknown, limit: unknown): Promise<ConsumeResult> {
  const key = String(sourceId ?? 'unknown')
  const max = Math.max(1, Number(limit) || 60)
  const client = await getRedis()
  if (client) {
    try {
      return await consumeRedis(client, key, max)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[rate-limit] Redis consume échec, fallback in-memory:', (err as Error).message)
    }
  }
  return consumeInMemory(key, max)
}

/**
 * Vide tous les compteurs. Pour tests/admin uniquement (touche uniquement
 * le store in-memory ; pour Redis on laisse l'expiration TTL faire le job).
 */
export function resetAll(): void {
  buckets.clear()
}

/**
 * Vide le compteur d'une source. Utile après modification du quota côté admin.
 * En mode Redis, on supprime également les clés du bucket courant.
 */
export async function resetForSource(sourceId: unknown): Promise<void> {
  const key = String(sourceId)
  buckets.delete(key)
  const client = await getRedis()
  if (client) {
    const windowKey = `rl:${key}:${Math.floor(Date.now() / WINDOW_MS)}`
    await client.del(windowKey).catch(() => {})
  }
}
