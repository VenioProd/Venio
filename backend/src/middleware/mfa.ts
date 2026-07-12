import type { Request, Response, NextFunction } from 'express'
import User from '../models/User.js'
import { requiresMfa } from '../lib/mfa.js'

const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000

/**
 * Vérifie une élévation MFA récente et écrit la réponse d'erreur homogène.
 * Exporté pour les politiques d'actions sensibles : celles-ci ne doivent pas
 * réimplémenter leur propre fenêtre de validité MFA.
 */
export async function requireRecentMfaStepUp(req: Request, res: Response): Promise<boolean> {
  if (!req.user || !requiresMfa(req.user.role)) return true
  const verifiedAt = req.user.mfaVerifiedAt ? new Date(req.user.mfaVerifiedAt).getTime() : 0
  if (verifiedAt && Date.now() - verifiedAt <= STEP_UP_MAX_AGE_MS) return true

  const user = await User.findById(req.user.id).select('twoFactorEnabled').lean()
  if (!user?.twoFactorEnabled) {
    res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant cette action sensible.' })
    return false
  }
  res.status(403).json({ error: 'MFA_STEP_UP_REQUIRED', message: 'Une vérification MFA récente est requise.' })
  return false
}

/** Require a recent second factor for security-sensitive endpoints. */
export default async function requireMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (await requireRecentMfaStepUp(req, res)) next()
}
