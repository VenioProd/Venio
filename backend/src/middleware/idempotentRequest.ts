import fs from 'node:fs'
import type { NextFunction, Request, Response } from 'express'
import UserIdempotencyKey from '../models/UserIdempotencyKey.js'
import { computeRequestHash } from '../lib/agent/idempotency.js'

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

function uploadedFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file]
  return Array.isArray(req.files) ? req.files : Object.values(req.files ?? {}).flat()
}

// Monté après multer, le middleware peut répondre sans exécuter la route : les fichiers reçus n'ont alors plus de propriétaire.
function discardUploads(req: Request): void {
  for (const file of uploadedFiles(req)) if (file.path) fs.rmSync(file.path, { force: true })
}

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
 * Toutes les réponses sont rejouées, erreurs serveur comprises : après un 5xx,
 * l'app vérifie l'état du lead avant de retenter avec une nouvelle clé.
 * À monter après `auth`.
 */
export default async function idempotentRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.get('Idempotency-Key')
  if (raw === undefined) {
    next()
    return
  }
  if (!UUID.test(raw)) {
    discardUploads(req)
    res.status(400).json({ error: 'Idempotency-Key doit être un UUID', code: 'INVALID_IDEMPOTENCY_KEY' })
    return
  }

  const record = {
    userId: req.user!.id,
    key: raw.toLowerCase(),
    method: req.method.toUpperCase(),
    path: (req.originalUrl || req.url).split('?')[0]!,
    requestHash: computeRequestHash(
      uploadedFiles(req).length
        ? { body: req.body, files: uploadedFiles(req).map((f) => [f.originalname, f.mimetype, f.size]) }
        : req.body,
    ),
  }

  try {
    const reserved = await UserIdempotencyKey.create(record)
    let stored = false
    const store = (body: unknown) => {
      stored = true
      return UserIdempotencyKey.updateOne(
        { _id: reserved._id },
        { $set: { responseStatus: res.statusCode || 200, responseBody: body } },
      )
    }
    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      // Même une erreur serveur est enregistrée : la route a pu écrire avant
      // d'échouer, et rejouer la requête dupliquerait cette écriture.
      store(body).then(
        () => send(body),
        () => send(body),
      )
      return res
    }
    // Une réponse qui ne passe pas par res.json (gestionnaire d'erreurs par
    // défaut, fichier…) est enregistrée sans corps, pour ne pas laisser la clé
    // bloquée « en cours ».
    res.on('finish', () => {
      if (!stored) store(null).catch(() => {})
    })
    next()
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) {
      next(err)
      return
    }
    discardUploads(req)
    const existing = await UserIdempotencyKey.findOne({ userId: record.userId, key: record.key }).lean()
    if (
      !existing ||
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
