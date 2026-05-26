import type { Request } from 'express'
import AuditLog from '../../models/AuditLog.js'
import type { AuditAction } from '../../types/enums.js'
import logger from '../logger.js'

/**
 * Construit l'identification d'acteur à partir d'une requête Express.
 * Utilisé par les routes pour tracer "qui a fait quoi" dans l'audit log.
 *
 * - Si la requête vient d'une source externe authentifiée (HMAC), on
 *   stocke le slug de la source dans metadata.
 * - Sinon, on stocke l'utilisateur JWT (id + email).
 */
export interface AuditActor {
  type: 'USER' | 'SYSTEM' | 'EXTERNAL'
  userId?: string
  email?: string
  externalSourceSlug?: string
  ip: string
  userAgent: string
}

interface ReqWithExternal extends Request {
  externalSource?: { slug: string }
}

export function buildActorFromReq(req: Request): AuditActor {
  const reqExt = req as ReqWithExternal
  const ip = (req.headers['x-forwarded-for'] as string) || req.ip || ''
  const userAgent = (req.headers['user-agent'] as string) || ''

  if (reqExt.externalSource?.slug) {
    return {
      type: 'EXTERNAL',
      externalSourceSlug: reqExt.externalSource.slug,
      ip,
      userAgent,
    }
  }

  if (req.user) {
    return {
      type: 'USER',
      userId: typeof req.user.id === 'string' ? req.user.id : String(req.user.id || ''),
      email: req.user.email || '',
      ip,
      userAgent,
    }
  }

  return { type: 'SYSTEM', ip, userAgent }
}

/**
 * Calcule un diff superficiel entre 2 objets plain et retourne le tableau
 * des champs modifiés. Pour audit log riche (avant/après).
 */
export function shallowDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Array<{ field: string; before: unknown; after: unknown }> {
  const diff: Array<{ field: string; before: unknown; after: unknown }> = []
  if (!before || !after) return diff
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      diff.push({ field: k, before: before[k], after: after[k] })
    }
  }
  return diff
}

/**
 * Enregistre un événement dans le journal d'audit.
 * NE FAIT JAMAIS échouer l'opération métier — toute erreur est silencieuse.
 *
 * On stocke les détails riches (actor, entityType, before/after, diff,
 * summary) dans le champ `metadata` puisque le modèle AuditLog existant
 * a une interface simple (action, userId, ip, userAgent, metadata).
 */
export async function recordAudit(params: {
  action: AuditAction
  actor: AuditActor
  entityType?: string
  entityId?: string
  entityRef?: string
  summary?: string
  before?: unknown
  after?: unknown
  diff?: unknown
  extra?: Record<string, unknown>
}): Promise<void> {
  try {
    const { action, actor, entityType, entityId, entityRef, summary, before, after, diff, extra } =
      params
    await AuditLog.create({
      userId: actor.userId || null,
      email: actor.email || '',
      action,
      ip: actor.ip,
      userAgent: actor.userAgent,
      metadata: {
        actorType: actor.type,
        externalSourceSlug: actor.externalSourceSlug,
        entityType,
        entityId,
        entityRef,
        summary,
        before,
        after,
        diff,
        ...extra,
      },
    })
  } catch (err) {
    // Audit append-only ne doit jamais bloquer le métier
    logger.error({ data: (err as Error).message }, 'recordAudit failed:')
  }
}
