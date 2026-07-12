import type { Request, Response, NextFunction } from 'express'
import User from '../models/User.js'
import { requiresMfa } from '../lib/mfa.js'

const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000

/** Require a recent second factor for security-sensitive endpoints. */
export default async function requireMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || !requiresMfa(req.user.role)) return next()
  const verifiedAt = req.user.mfaVerifiedAt ? new Date(req.user.mfaVerifiedAt).getTime() : 0
  if (verifiedAt && Date.now() - verifiedAt <= STEP_UP_MAX_AGE_MS) return next()

  const user = await User.findById(req.user.id).select('twoFactorEnabled').lean()
  if (!user?.twoFactorEnabled) {
    res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant cette action sensible.' })
    return
  }
  res.status(403).json({ error: 'MFA_STEP_UP_REQUIRED', message: 'Une vérification MFA récente est requise.' })
}
