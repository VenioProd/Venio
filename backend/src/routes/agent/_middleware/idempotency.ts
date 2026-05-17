import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import AgentIdempotencyKey from '../../../models/AgentIdempotencyKey.js'
import { computeRequestHash, isValidIdempotencyKey } from '../../../lib/agent/idempotency.js'
import { respondError } from './errors.js'

/**
 * Méthodes considérées comme des mutations et qui exigent une Idempotency-Key.
 */
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Middleware d'idempotency pour l'API agent.
 *
 * Sémantique :
 *   - Méthode non mutante (GET, HEAD, OPTIONS) → pass-through, pas de check.
 *   - Mutation sans header Idempotency-Key → 400 MISSING_IDEMPOTENCY_KEY.
 *   - Mutation avec key invalide (regex) → 400 INVALID_IDEMPOTENCY_KEY.
 *   - Mutation avec key déjà vue + même requestHash → on REJOUE la réponse
 *     stockée (mêmes status + body).
 *   - Mutation avec key déjà vue + hash différent → 409 IDEMPOTENCY_CONFLICT.
 *   - Sinon : on wrappe res.json pour stocker la réponse après envoi avec
 *     TTL Mongo 24h.
 *
 * À monter APRÈS agentAuth (req.agentToken requis).
 */
export default async function agentIdempotency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
    next()
    return
  }

  const token = req.agentToken
  if (!token) {
    // Bug d'ordre de middleware
    respondError(res, 401, 'MISSING_TOKEN', 'Authentification requise')
    return
  }

  const rawKey = req.headers['idempotency-key']
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey
  if (!key) {
    respondError(
      res,
      400,
      'MISSING_IDEMPOTENCY_KEY',
      'Header Idempotency-Key requis sur POST/PATCH/PUT/DELETE'
    )
    return
  }
  if (!isValidIdempotencyKey(key)) {
    respondError(
      res,
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key invalide (lettres, chiffres, tirets, 8-255 chars)'
    )
    return
  }

  const requestHash = computeRequestHash(req.body)

  let existing
  try {
    existing = await AgentIdempotencyKey.findOne({
      tokenId: new mongoose.Types.ObjectId(token.id),
      key,
    }).lean()
  } catch (err) {
    console.error('[agent-idempotency] lookup failed:', (err as Error).message)
    next()
    return
  }

  if (existing) {
    if (existing.requestHash !== requestHash) {
      respondError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key déjà utilisée avec un body différent',
        {
          previousMethod: existing.method,
          previousPath: existing.path,
        }
      )
      return
    }
    // Rejouer la réponse stockée
    res.status(existing.responseStatus).json(existing.responseBody)
    return
  }

  // Wrap res.json pour capturer la réponse et la persister après envoi.
  const tokenObjId = new mongoose.Types.ObjectId(token.id)
  const method = req.method.toUpperCase()
  const path = req.originalUrl.split('?')[0] || req.path

  const originalJson = res.json.bind(res)
  res.json = function wrappedJson(body: unknown): Response {
    // Persiste en arrière-plan (best-effort). On ne bloque pas la réponse.
    const status = res.statusCode || 200
    AgentIdempotencyKey.create({
      tokenId: tokenObjId,
      key,
      method,
      path,
      requestHash,
      responseStatus: status,
      responseBody: body,
    }).catch((err: unknown) => {
      const e = err as { code?: number; message?: string }
      // Code 11000 = collision unique (race condition entre 2 requêtes
      // concurrentes avec la même clé). C'est OK, le 1er insert a gagné.
      if (e.code !== 11000) {
        console.error('[agent-idempotency] store failed:', e.message)
      }
    })
    return originalJson(body)
  }

  next()
}
