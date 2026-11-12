import type { Request, Response, NextFunction } from 'express'

export const isInternManager = (role: string | undefined) => role === 'SUPER_ADMIN' || role === 'RH'

export function requireInternManager(req: Request, res: Response, next: NextFunction) {
  if (!isInternManager(req.user?.role)) {
    return res.status(403).json({ error: 'Non autorisé' })
  }
  next()
}
