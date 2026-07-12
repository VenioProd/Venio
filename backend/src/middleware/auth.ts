import type { Request, Response, NextFunction } from 'express'
import { authenticateSession, readSessionCookie } from '../lib/session.js'

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
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
