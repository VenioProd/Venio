import express, { type NextFunction, type Request, type Response } from 'express'
import { respondError } from './errors.js'

/** Limite du body JSON sur toute la famille /api/v1/agent. */
export const AGENT_JSON_BODY_LIMIT = '8mb'

type JsonParserError = Error & {
  status?: number
  statusCode?: number
  type?: string
}

const parseJson = express.json({ limit: AGENT_JSON_BODY_LIMIT })

/**
 * Parse le JSON agent en conservant le contrat d'erreur de cette API.
 *
 * `express.json()` est nécessairement monté avant le router métier. Sans ce
 * wrapper, ses erreurs 400/413 seraient traitées par le handler global de
 * l'application et perdraient `code` et `requestId`.
 */
export function agentJsonBodyParser(req: Request, res: Response, next: NextFunction): void {
  parseJson(req, res, (err?: JsonParserError) => {
    if (!err) return next()

    if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
      return respondError(res, 413, 'PAYLOAD_TOO_LARGE', 'La requête dépasse la limite JSON de 8 MiB de l’API agent')
    }

    if (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400) {
      return respondError(res, 400, 'MALFORMED_JSON', 'Le corps de la requête doit être un JSON valide')
    }

    next(err)
  })
}
