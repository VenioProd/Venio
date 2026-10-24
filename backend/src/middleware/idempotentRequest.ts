import type { NextFunction, Request, Response } from 'express'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import { computeRequestHash } from '../lib/agent/idempotency.js'

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

/**
 * Idempotence facultative d'une mutation, pour l'app hors ligne : sans en-tête
 * `Idempotency-Key`, la route se comporte comme avant. Avec une clé :
 *   - première requête : la clé est réservée, la route s'exécute, sa réponse
 *     est enregistrée avant d'être envoyée (un client qui l'a reçue peut donc
 *     toujours la rejouer) ;
 *   - même clé, même méthode, même chemin, même corps : réponse enregistrée
 *     rejouée telle quelle ;
 *   - même clé pour autre chose : 409 IDEMPOTENCY_CONFLICT ;
 *   - même clé pendant que la première s'exécute : 409 IDEMPOTENCY_IN_PROGRESS.
 * Une erreur serveur (5xx) libère la clé pour qu'un nouvel essai s'exécute.
 * À monter après `auth`.
 */
export default async function idempotentRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.get('Idempotency-Key')
  if (raw === undefined) {
    next()
    return
  }
  if (!UUID.test(raw)) {
    res.status(400).json({ error: 'Idempotency-Key doit être un UUID', code: 'INVALID_IDEMPOTENCY_KEY' })
    return
  }

  const record = {
    userId: req.user!.id,
    key: raw.toLowerCase(),
    method: req.method.toUpperCase(),
    path: (req.originalUrl || req.url).split('?')[0]!,
    requestHash: computeRequestHash(req.body),
  }

  try {
    const reserved = await UserIdempotencyKey.create(record)
    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      const status = res.statusCode || 200
      const persist =
        status >= 500
          ? UserIdempotencyKey.deleteOne({ _id: reserved._id })
          : UserIdempotencyKey.updateOne(
              { _id: reserved._id },
              { $set: { responseStatus: status, responseBody: body } },
            )
      persist.then(
        () => send(body),
        () => send(body),
      )
      return res
    }
    next()
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) {
      next(err)
      return
    }
    const existing = await UserIdempotencyKey.findOne({ userId: record.userId, key: record.key }).lean()
    // Disparue entre-temps : la première requête a échoué en 5xx et l'a libérée.
    if (!existing) {
      res.status(409).json({ error: 'Réessayez dans un instant', code: 'IDEMPOTENCY_IN_PROGRESS' })
      return
    }
    if (
      existing.method !== record.method ||
      existing.path !== record.path ||
      existing.requestHash !== record.requestHash
    ) {
      res.status(409).json({
        error: 'Cette clé a déjà servi pour une autre opération',
        code: 'IDEMPOTENCY_CONFLICT',
      })
      return
    }
    if (existing.responseStatus === null) {
      res.status(409).json({
        error: 'La même requête est en cours de traitement, réessayez dans un instant',
        code: 'IDEMPOTENCY_IN_PROGRESS',
      })
      return
    }
    res.status(existing.responseStatus).json(existing.responseBody)
  }
}
