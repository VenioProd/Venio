import type { NextFunction, Request, Response } from 'express'

/**
 * Réserve une route au navigateur même sous un préfixe ouvert à l'app. Posé sur
 * la route elle-même, après le routage d'Express : un chemin encodé ne le contourne pas.
 */
export default function requireBrowserSession(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.deviceId) {
    res.status(403).json({ error: 'Cette action se fait depuis le navigateur.', code: 'BROWSER_SESSION_REQUIRED' })
    return
  }
  next()
}
