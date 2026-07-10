import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload } from '../types/express.js'
import User from '../models/User.js'

export default async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload
    const user = await User.findById(payload.id).select('role status isActive sessionVersion').lean()
    if (!user || !user.isActive || user.status === 'ARCHIVE') {
      res.status(403).json({ error: 'Votre accès a été désactivé. Contactez votre chargé de compte.' })
      return
    }

    // Do not trust role/authorization state embedded in an old JWT.
    // Legacy tokens do not contain sessionVersion and are intentionally invalidated.
    const currentSessionVersion = user.sessionVersion ?? 0
    if (user.role !== payload.role || currentSessionVersion !== payload.sessionVersion) {
      res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter.' })
      return
    }

    req.user = payload
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}
