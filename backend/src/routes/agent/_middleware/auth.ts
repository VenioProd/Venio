import type { Request, Response, NextFunction } from 'express'
import AgentToken from '../../../models/AgentToken.js'
import AuditLog from '../../../models/AuditLog.js'
import {
  extractPrefix,
  isValidTokenFormat,
  verifyAgentToken,
} from '../../../lib/agent/tokens.js'
import { hasAllScopes, missingScopes } from '../../../lib/agent/scopes.js'
import { respondError } from './errors.js'

const AUTH_SUCCESS_LOG_INTERVAL_MS = 15 * 60 * 1000

/**
 * Middleware d'authentification de l'API agent.
 *
 * Étapes :
 *   1. Parse Authorization: Bearer <token>
 *   2. Vérifie le format public (vno_pat_<32 chars base62>)
 *   3. Lookup AgentToken par prefix + status ACTIVE
 *   4. bcrypt.compare du secret entier
 *   5. Vérifie expiresAt
 *   6. Attache req.agentToken (sans tokenHash) et continue
 *
 * En cas d'échec : 401 avec un code générique INVALID_TOKEN pour empêcher
 * l'énumération. Les tentatives d'auth ratées sont loggées dans AuditLog
 * (AGENT_AUTH_FAIL) — best-effort, n'échoue jamais la requête.
 */
export default async function agentAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = String(req.headers.authorization || '')
  const plain = header.startsWith('Bearer ') ? header.slice(7).trim() : ''

  // 1. Header absent
  if (!plain) {
    respondError(res, 401, 'MISSING_TOKEN', 'Header Authorization: Bearer requis')
    return
  }

  // 2. Format
  if (!isValidTokenFormat(plain)) {
    void logAuthFail(req, 'BAD_FORMAT')
    respondError(res, 401, 'INVALID_TOKEN', 'Token invalide')
    return
  }

  let prefix: string
  try {
    prefix = extractPrefix(plain)
  } catch {
    respondError(res, 401, 'INVALID_TOKEN', 'Token invalide')
    return
  }

  // 3. Lookup par prefix
  const token = await AgentToken.findOne({ prefix, status: 'ACTIVE' })
    .select('+tokenHash')
    .exec()
  if (!token) {
    void logAuthFail(req, 'PREFIX_NOT_FOUND')
    respondError(res, 401, 'INVALID_TOKEN', 'Token invalide')
    return
  }

  // 4. Vérification bcrypt
  const ok = await verifyAgentToken(plain, token.tokenHash)
  if (!ok) {
    void logAuthFail(req, 'HASH_MISMATCH', String(token._id))
    respondError(res, 401, 'INVALID_TOKEN', 'Token invalide')
    return
  }

  // 5. Expiration
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
    void logAuthFail(req, 'EXPIRED_TOKEN', String(token._id))
    respondError(res, 401, 'EXPIRED_TOKEN', 'Token expiré')
    return
  }

  // 6. Attach + update lastUsed async (fire-and-forget)
  const ip = String(
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || ''
  )
  const userAgent = String(req.headers['user-agent'] || '')

  req.agentToken = {
    id: String(token._id),
    name: token.name,
    prefix: token.prefix,
    scopes: [...token.scopes],
    rateLimitPerMin: token.rateLimitPerMin,
  }

  if (shouldLogAuthSuccess(token.lastUsedAt, token.lastUsedIp, token.lastUsedUserAgent, ip, userAgent)) {
    void logAuthSuccess(req, {
      id: String(token._id),
      name: token.name,
      prefix: token.prefix,
      scopes: [...token.scopes],
      ip,
      userAgent,
    })
  }

  AgentToken.updateOne(
    { _id: token._id },
    {
      $set: { lastUsedAt: new Date(), lastUsedIp: ip, lastUsedUserAgent: userAgent },
      $inc: { totalRequests: 1 },
    }
  ).catch((err: unknown) => {
    console.error('[agent-auth] failed to update lastUsed:', (err as Error).message)
  })

  next()
}

function shouldLogAuthSuccess(
  lastUsedAt: Date | null | undefined,
  lastUsedIp: string | null | undefined,
  lastUsedUserAgent: string | null | undefined,
  ip: string,
  userAgent: string
): boolean {
  if (!lastUsedAt) return true
  if ((lastUsedIp || '') !== ip) return true
  if ((lastUsedUserAgent || '') !== userAgent) return true
  return Date.now() - lastUsedAt.getTime() > AUTH_SUCCESS_LOG_INTERVAL_MS
}

async function logAuthSuccess(
  req: Request,
  token: {
    id: string
    name: string
    prefix: string
    scopes: string[]
    ip: string
    userAgent: string
  }
): Promise<void> {
  try {
    await AuditLog.create({
      userId: null,
      email: '',
      action: 'AGENT_AUTH_SUCCESS',
      ip: token.ip,
      userAgent: token.userAgent,
      metadata: {
        actorType: 'AGENT',
        tokenId: token.id,
        tokenName: token.name,
        tokenPrefix: token.prefix,
        scopes: token.scopes,
        path: req.path,
        method: req.method,
      },
    })
  } catch (err) {
    console.error('[agent-auth] logAuthSuccess error:', (err as Error).message)
  }
}

/**
 * Factory de middleware pour vérifier qu'un token possède un ou plusieurs
 * scopes requis. Usage :
 *
 *   router.get('/clients', requireScope('read:crm'), handler)
 *   router.post('/clients', requireScope('write:crm'), handler)
 *   router.post('/something', requireScope('read:x', 'write:y'), handler)
 *
 * Renvoie 403 INSUFFICIENT_SCOPE avec { required, granted } en cas d'échec.
 */
export function requireScope(...required: string[]) {
  return function scopeMiddleware(req: Request, res: Response, next: NextFunction): void {
    const token = req.agentToken
    if (!token) {
      // agentAuth doit toujours précéder requireScope ; si on est ici sans
      // token attaché, c'est un bug d'ordre de middleware
      respondError(res, 401, 'MISSING_TOKEN', 'Authentification requise')
      return
    }
    if (!hasAllScopes(token.scopes, required)) {
      respondError(res, 403, 'INSUFFICIENT_SCOPE', 'Scope manquant pour cette ressource', {
        required,
        granted: token.scopes,
        missing: missingScopes(token.scopes, required),
      })
      return
    }
    next()
  }
}

/**
 * Trace une tentative d'authentification échouée dans AuditLog. Best-effort —
 * n'échoue jamais l'auth.
 */
async function logAuthFail(req: Request, reason: string, tokenId?: string): Promise<void> {
  try {
    const ip = String(
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] || req.ip || ''
    )
    const userAgent = String(req.headers['user-agent'] || '')
    await AuditLog.create({
      userId: null,
      email: '',
      action: 'AGENT_AUTH_FAIL',
      ip,
      userAgent,
      metadata: {
        actorType: 'AGENT',
        reason,
        path: req.path,
        method: req.method,
        tokenId: tokenId || null,
      },
    })
  } catch (err) {
    console.error('[agent-auth] logAuthFail error:', (err as Error).message)
  }
}
