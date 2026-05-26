import type { Request, Response, NextFunction } from 'express'
import AgentToken from '../../../models/AgentToken.js'
import AuditLog from '../../../models/AuditLog.js'
import type { AuditAction } from '../../../types/enums.js'
import logger from '../../../lib/logger.js'

/**
 * Métadonnées d'audit que les handlers peuvent renseigner pour enrichir
 * l'entrée AuditLog : entityType, entityId, summary, before/after, etc.
 *
 * Usage côté handler :
 *   res.locals.audit = {
 *     entityType: 'Client',
 *     entityId: String(client._id),
 *     summary: `Création du client ${client.name}`,
 *     before: null,
 *     after: client.toObject(),
 *     action: 'AGENT_API_MUTATION',  // optionnel, défaut = AGENT_API_MUTATION
 *   }
 *
 * Si res.locals.audit n'est pas défini, on log quand même une entrée
 * générique avec action AGENT_API_MUTATION.
 */
export interface AgentAuditMeta {
  entityType?: string
  entityId?: string
  entityRef?: string
  summary?: string
  before?: unknown
  after?: unknown
  action?: AuditAction
  extra?: Record<string, unknown>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      audit?: AgentAuditMeta
    }
  }
}

/**
 * Méthodes considérées comme des mutations à auditer.
 */
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Middleware d'audit pour l'API agent.
 *
 * - Sur les GET : pas de log (volume).
 * - Sur les mutations 2xx : log dans AuditLog avec action AGENT_API_MUTATION
 *   (ou action spécifique si res.locals.audit.action est posé) et
 *   metadata.actorType = 'AGENT'.
 *
 * Best-effort : si l'écriture AuditLog échoue, on logue en console mais on
 * ne casse pas la réponse — elle a déjà été envoyée.
 *
 * À monter APRÈS agentAuth.
 */
export default function agentAudit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
    next()
    return
  }

  // Hook sur la fin de la réponse — exécuté après que le body soit envoyé,
  // quel que soit le code de statut.
  res.on('finish', () => {
    void logIfNeeded(req, res)
  })

  next()
}

async function logIfNeeded(req: Request, res: Response): Promise<void> {
  try {
    // On ne loggue que les succès (2xx)
    if (res.statusCode < 200 || res.statusCode >= 300) return

    const token = req.agentToken
    if (!token) return

    const meta = res.locals.audit || {}
    const action: AuditAction = meta.action || 'AGENT_API_MUTATION'

    const ip = String(
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || ''
    )
    const userAgent = String(req.headers['user-agent'] || '')
    const idempotencyKey = req.headers['idempotency-key']
      ? String(req.headers['idempotency-key'])
      : null

    await AuditLog.create({
      userId: null,
      email: '',
      action,
      ip,
      userAgent,
      metadata: {
        actorType: 'AGENT',
        agentTokenId: token.id,
        agentTokenName: token.name,
        agentTokenPrefix: token.prefix,
        scopes: token.scopes,
        method: req.method.toUpperCase(),
        path: req.originalUrl.split('?')[0] || req.path,
        requestId: req.requestId || null,
        idempotencyKey,
        responseStatus: res.statusCode,
        entityType: meta.entityType,
        entityId: meta.entityId,
        entityRef: meta.entityRef,
        summary: meta.summary,
        before: meta.before,
        after: meta.after,
        ...(meta.extra || {}),
      },
    })

    // Incrémente le compteur de mutations sur le token (best-effort)
    AgentToken.updateOne(
      { _id: token.id },
      { $inc: { totalMutations: 1 } }
    ).catch((err: unknown) => {
      logger.error({ data: (err as Error).message }, '[agent-audit] inc totalMutations failed:')
    })
  } catch (err) {
    logger.error({ data: (err as Error).message }, '[agent-audit] log failed:')
  }
}
