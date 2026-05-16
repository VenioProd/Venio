import type { Request, Response, NextFunction } from 'express'

/**
 * Format d'erreur standardisé pour l'API agent.
 *
 * Toute erreur renvoyée par /api/v1/agent/* a la forme :
 *   { error: "Message lisible", code: "CODE_MACHINE", requestId: "req_..." }
 *
 * Le code machine est documenté dans docs/api-agent.md (table des erreurs).
 */
export interface AgentErrorPayload {
  error: string
  code: string
  requestId?: string
  /** Détails additionnels (ex: { required, granted } pour INSUFFICIENT_SCOPE). */
  details?: Record<string, unknown>
}

/**
 * Erreur typée qu'un handler peut throw pour court-circuiter sur une réponse
 * standardisée. L'errorHandler en bas du router la convertit en JSON.
 */
export class AgentApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Helper bas niveau pour envoyer une erreur formatée sans throw.
 */
export function respondError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const payload: AgentErrorPayload = { error: message, code }
  if (res.req?.requestId) payload.requestId = res.req.requestId
  if (details) payload.details = details
  res.status(status).json(payload)
}

/**
 * Génère un identifiant de requête lisible. Utilisé par tous les middlewares
 * + handlers pour corréler logs et audit.
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Middleware d'entrée : assigne un requestId à chaque requête agent.
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = generateRequestId()
  next()
}

/**
 * Error handler terminal monté en fin de router agent. Capture AgentApiError
 * et toute autre erreur, et renvoie un JSON standardisé.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function agentErrorHandler(
  err: Error & { status?: number; code?: string; details?: Record<string, unknown> },
  _req: Request,
  res: Response,
  // _next n'est pas utilisé mais Express exige un middleware d'arity 4 pour
  // être considéré comme un error handler
  _next: NextFunction
): void {
  if (res.headersSent) {
    return
  }
  if (err instanceof AgentApiError) {
    respondError(res, err.status, err.code, err.message, err.details)
    return
  }
  const status = err.status || 500
  const code = err.code || 'INTERNAL'
  const message = status >= 500
    ? 'Erreur interne du serveur'
    : err.message || 'Erreur inconnue'
  respondError(res, status, code, message, err.details)
}
