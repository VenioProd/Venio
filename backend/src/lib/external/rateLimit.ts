/**
 * Rate limit in-memory simple par source.
 *
 * Algorithme : sliding window 1 minute (fenêtre glissante naïve).
 * On garde par sourceId un compteur et un timestamp de début de fenêtre.
 * Dès que la fenêtre dépasse 60 secondes, on la reset.
 *
 * Limites :
 *   - Mono-process uniquement. Si le backend est scalé en plusieurs instances
 *     (cluster Node, plusieurs containers), chaque instance aura son propre
 *     compteur — le quota effectif sera donc multiplié par le nombre d'instances.
 *   - Pour un déploiement multi-instances, il faudrait remplacer cette
 *     implémentation par un store partagé (Redis avec INCR + EXPIRE, ou un
 *     module dédié type rate-limiter-flexible avec store Redis).
 *
 * Migration Redis prévue pour le multi-instance — voir issue #81.
 */

const WINDOW_MS = 60 * 1000

interface Bucket {
  windowStart: number
  count: number
}

const buckets: Map<string, Bucket> = new Map()

export interface ConsumeResult {
  ok: boolean
  retryAfter: number
  remaining: number
}

/**
 * Tente de consommer 1 token pour la source donnée.
 *
 * @param sourceId  identifiant logique (ObjectId, string ou slug)
 * @param limit     nombre max d'appels par minute (>=1)
 * @returns ok          : true si l'appel est autorisé, false sinon
 *          retryAfter  : nombre de secondes avant la prochaine fenêtre (1..60)
 *          remaining   : tokens restants dans la fenêtre courante
 */
export function consume(sourceId: unknown, limit: unknown): ConsumeResult {
  const key = String(sourceId ?? 'unknown')
  const max = Math.max(1, Number(limit) || 60)
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

/**
 * Vide tous les compteurs. Pour tests/admin uniquement.
 */
export function resetAll(): void {
  buckets.clear()
}

/**
 * Vide le compteur d'une source. Utile après modification du quota côté admin.
 */
export function resetForSource(sourceId: unknown): void {
  buckets.delete(String(sourceId))
}
