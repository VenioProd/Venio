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

    // Les agents système ne doivent JAMAIS s'authentifier via ce middleware.
    // Ils utilisent obligatoirement agent/_middleware/auth.ts (bearer AgentToken
    // avec scopes). Refus explicite ici pour éviter qu'un JWT forgé/abusé avec
    // role=AGENT ne court-circuite le contrôle de scopes.
    if (payload.role === 'AGENT') {
      res.status(401).json({ error: 'Agent tokens are not accepted on this endpoint' })
      return
    }

    req.user = payload

    // Bloquer les clients archivés même si leur token est encore valide
    if (payload.role === 'CLIENT') {
      const user = await User.findById(payload.id).select('status').lean()
      if (user?.status === 'ARCHIVE') {
        res.status(403).json({ error: 'Votre accès a été désactivé. Contactez votre chargé de compte.' })
        return
      }
    }

    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}
