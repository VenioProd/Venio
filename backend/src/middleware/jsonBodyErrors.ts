import type { NextFunction, Request, Response } from 'express'

type JsonBodyParserError = Error & {
  status?: number
  type?: string
}

/**
 * Converts errors emitted by Express' JSON parser into the stable API envelope
 * used by human and admin clients. Other errors keep flowing to the global
 * handler so its production-safe 5xx policy remains unchanged.
 */
export function jsonBodyErrorHandler(
  err: JsonBodyParserError,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON malformé', code: 'MALFORMED_JSON' })
    return
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload trop volumineux', code: 'PAYLOAD_TOO_LARGE' })
    return
  }

  next(err)
}
