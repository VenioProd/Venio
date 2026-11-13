import type { Request, Response, NextFunction } from 'express'
import { authenticateSession, readSessionCookie } from '../lib/session.js'

const MFA_ENROLLMENT_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/admin/2fa/setup',
  '/api/admin/2fa/status',
  '/api/admin/2fa/verify',
  '/api/auth/2fa/status',
  '/api/auth/2fa/setup',
  '/api/auth/2fa/confirm',
])

/**
 * Surfaces ouvertes à l'app native. Liste blanche plutôt que liste noire : une
 * route qui crée des comptes, change des identifiants ou expose des secrets
 * (stagiaires, administrateurs, MFA, jetons agent, coffre d'outils…) reste
 * réservée au navigateur sans qu'on ait à la penser, y compris quand elle est
 * ajoutée plus tard. Un appareil perdu ne doit pas permettre de s'approprier
 * le compte ni d'en ouvrir d'autres.
 */
const BEARER_ALLOWED_PREFIXES = [
  '/api/auth/me',
  '/api/auth/mobile',
  '/api/mobile',
  '/api/notification-preferences',
  '/api/admin/crm',
  // Poste d'appel de l'équipe (lot N) : jeton Voice, lancement par l'identifiant du lead, saisie rapide.
  '/api/admin/call-desk',
  '/api/admin/interactions',
  '/api/admin/clients',
  '/api/admin/projects',
  '/api/admin/quote-proposals',
  '/api/admin/quote-templates',
  '/api/admin/sales-targets',
  '/api/admin/billing',
  '/api/admin/notifications',
  '/api/admin/dashboard',
  '/api/admin/analytics',
  '/api/admin/calendar',
  '/api/admin/tickets',
  '/api/admin/change-requests',
  '/api/admin/messaging',
  '/api/admin/activity-center',
  '/api/admin/inbox',
  '/api/admin/search',
]

const BEARER_ALLOWED_ROUTES = [
  { method: 'GET', pattern: /^\/api\/admin\/accounting\/reports\/dashboard\/?$/i },
  { method: 'GET', pattern: /^\/api\/admin\/accounting\/project-finance\/dashboard\/?$/i },
  { method: 'GET', pattern: /^\/api\/admin\/accounting\/project-finance\/cash-in\/?$/i },
  { method: 'GET', pattern: /^\/api\/admin\/accounting\/projects\/[a-f\d]{24}\/finance\/?$/i },
  { method: 'GET', pattern: /^\/api\/admin\/accounting\/beneficiaries\/?$/i },
  { method: 'GET', pattern: /^\/api\/admin\/dev\/issues\/?$/i },
  { method: 'PATCH', pattern: /^\/api\/admin\/dev\/issues\/[a-f\d]{24}\/?$/i },
]

function isBearerAllowed(path: string, method: string): boolean {
  // Le routage Express ignore la casse : la comparaison aussi.
  const normalized = path.toLowerCase()
  return (
    BEARER_ALLOWED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)) ||
    BEARER_ALLOWED_ROUTES.some((route) => route.method === method && route.pattern.test(path))
  )
}

/**
 * Le commercial externe n'a accès qu'à son espace. Liste blanche ici, en un
 * seul point, plutôt qu'un contrôle par routeur : une route qui ne vérifie que
 * l'authentification (ou qu'on ajoutera plus tard) lui reste fermée.
 */
const EXTERNAL_SALES_ALLOWED_PREFIXES = ['/api/auth', '/api/commercial']

function isExternalSalesAllowed(path: string): boolean {
  const normalized = path.toLowerCase()
  return EXTERNAL_SALES_ALLOWED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function rejectsExternalSales(role: string, path: string, res: Response): boolean {
  if (role !== 'COMMERCIAL_EXTERNE' || isExternalSalesAllowed(path)) return false
  res.status(403).json({ error: 'Forbidden' })
  return true
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
    if (rejectsExternalSales(payload.role, path, res)) return
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
    if (!isBearerAllowed(path, req.method)) {
      res.status(403).json({
        error: 'Cette action se fait depuis le navigateur.',
        code: 'BROWSER_SESSION_REQUIRED',
      })
      return
    }
    if (rejectsExternalSales(payload.role, path, res)) return
    req.user = payload
    next()
  } catch {
    invalid()
  }
}
