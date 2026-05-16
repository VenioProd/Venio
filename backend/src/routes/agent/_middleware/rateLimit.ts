import type { Request, Response, NextFunction } from 'express'
import { consume } from '../../../lib/external/rateLimit.js'
import { respondError } from './errors.js'

/**
 * Rate limit par token agent. Doit être monté APRÈS agentAuth (req.agentToken
 * doit être disponible). Quota configurable par token via
 * AgentToken.rateLimitPerMin (défaut 120).
 *
 * Implémentation : sliding window in-memory (lib/external/rateLimit) — donc
 * mono-process. Si le backend scale en plusieurs instances, le quota
 * effectif est multiplié par le nombre d'instances. À migrer sur Redis
 * quand le besoin se présentera (TODO existant dans rateLimit.ts).
 *
 * Réponse 429 RATE_LIMITED + header `Retry-After: <secondes>`.
 */
export default function agentRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.agentToken
  if (!token) {
    // Sans token attaché, on ne peut pas limiter par token — c'est un bug
    // d'ordre de middleware. On laisse passer pour ne pas dégrader, l'auth
    // a déjà rejeté en théorie.
    next()
    return
  }
  const limit = Math.max(1, Number(token.rateLimitPerMin) || 120)
  const result = consume(`agent:${token.id}`, limit)
  if (!result.ok) {
    res.setHeader('Retry-After', String(result.retryAfter))
    respondError(res, 429, 'RATE_LIMITED', 'Quota par minute dépassé', {
      retryAfter: result.retryAfter,
    })
    return
  }
  res.setHeader('X-RateLimit-Limit', String(limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  next()
}
