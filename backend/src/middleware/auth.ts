import type { Request, Response, NextFunction } from 'express'
import { authenticateSession, readSessionCookie } from '../lib/session.js'

const MFA_ENROLLMENT_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/admin/2fa/setup',
  '/api/admin/2fa/status',
  '/api/admin/2fa/verify',
])

/**
 * Ce qui crée des accès, change des identifiants ou expose des secrets reste
 * réservé au navigateur : un appareil perdu ou volé ne doit pas permettre de
 * s'approprier le compte ni d'en ouvrir d'autres.
 */
const BEARER_FORBIDDEN_PREFIXES = [
  '/api/admin/agent-tokens',
  '/api/admin/admins',
  '/api/admin/users',
  '/api/admin/2fa',
  '/api/admin/backups',
  '/api/admin/tool-access',
  '/api/admin/accounting',
  '/api/admin/webhooks',
  '/api/auth/profile',
  '/api/auth/change-password',
]

function isBearerForbidden(path: string): boolean {
  // Le routage Express ignore la casse : la comparaison aussi.
  const normalized = path.toLowerCase()
  return BEARER_FORBIDDEN_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

/**
 * `undefined` : pas d'en-tête Authorization, on retombe sur le cookie.
 * `null` : en-tête présent mais inexploitable.
 */
function readBearerToken(header: string | undefined): string | null | undefined {
  if (header === undefined) return undefined
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header.trim())
  return match ? match[1]! : null
}

export default async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = (req.originalUrl || req.url).split('?')[0]!
  const bearer = readBearerToken(req.headers.authorization)
  if (bearer !== undefined) {
    await authenticateBearer(bearer, path, req, res, next)
    return
  }

  const token = readSessionCookie(req.headers.cookie)

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = await authenticateSession(token)
    if (!payload) {
      res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' })
      return
    }
    req.user = payload
    if (payload.mfaEnrollmentOnly && !MFA_ENROLLMENT_ALLOWED_PATHS.has(path)) {
      res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant de continuer.' })
      return
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Un en-tête Authorization présent l'emporte sur le cookie : la requête est
// celle d'un client natif et n'est jamais rattrapée par la session navigateur.
async function authenticateBearer(
  token: string | null,
  path: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const invalid = () =>
    res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.', code: 'INVALID_ACCESS_TOKEN' })
  if (!token) {
    invalid()
    return
  }
  try {
    const payload = await authenticateSession(token, 'bearer')
    if (!payload) {
      invalid()
      return
    }
    if (isBearerForbidden(path)) {
      res.status(403).json({
        error: 'Cette action se fait depuis le navigateur.',
        code: 'BROWSER_SESSION_REQUIRED',
      })
      return
    }
    req.user = payload
    next()
  } catch {
    invalid()
  }
}
