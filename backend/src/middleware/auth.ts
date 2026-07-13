import type { Request, Response, NextFunction } from 'express'
import { authenticateSession, readSessionCookie } from '../lib/session.js'

const MFA_ENROLLMENT_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/admin/2fa/setup',
  '/api/admin/2fa/status',
  '/api/admin/2fa/verify',
])

export default async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    if (payload.mfaEnrollmentOnly && !MFA_ENROLLMENT_ALLOWED_PATHS.has((req.originalUrl || req.url).split('?')[0])) {
      res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant de continuer.' })
      return
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
