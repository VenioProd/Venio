import type { Request, Response, NextFunction } from 'express'
import type { UserRole, Permission } from '../types/enums.js'
import { hasPermissionResolved, isAdminRole } from '../lib/permissions.js'
import User from '../models/User.js'
import { graceEndsAt, isMfaEnrollmentRoute, requiresMfa } from '../lib/mfa.js'

export default function requireRole(role: UserRole) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

async function ensureMfaEnrollment(req: Request, res: Response): Promise<boolean> {
  if (!req.user || !requiresMfa(req.user.role) || isMfaEnrollmentRoute(req.originalUrl || req.url)) {
    return true
  }

  const user = await User.findById(req.user.id).select('twoFactorEnabled mfaGraceUntil')
  if (!user) {
    res.status(403).json({ error: 'Forbidden' })
    return false
  }
  if (user.twoFactorEnabled) return true

  if (!user.mfaGraceUntil) {
    user.mfaGraceUntil = graceEndsAt()
    await user.save()
    return true
  }

  if (user.mfaGraceUntil.getTime() > Date.now()) return true

  res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant de continuer.' })
  return false
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || !isAdminRole(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (!(await ensureMfaEnrollment(req, res))) return
  next()
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (!(await ensureMfaEnrollment(req, res))) return
  next()
}

/**
 * Résout une permission pour l'utilisateur courant sans interrompre la requête.
 * À utiliser quand un écran reste accessible mais qu'une partie de sa charge
 * utile doit être masquée — typiquement le chiffre d'affaires du dashboard pour
 * un admin dont la comptabilité a été retirée via deniedPermissions.
 */
export async function userHasPermission(req: Request, permission: Permission): Promise<boolean> {
  if (!req.user) return false
  if (req.user.role === 'SUPER_ADMIN') return true
  const dbUser = await User.findById(req.user.id).select('grantedPermissions deniedPermissions').lean()
  return hasPermissionResolved(
    req.user.role as UserRole,
    permission,
    dbUser?.grantedPermissions ?? [],
    dbUser?.deniedPermissions ?? [],
  )
}

export function requirePermission(permission: Permission) {
  return async function permissionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (!(await ensureMfaEnrollment(req, res))) return
    // SUPER_ADMIN bypasses everything
    if (req.user.role === 'SUPER_ADMIN') {
      next()
      return
    }
    // For other roles, check grantedPermissions/deniedPermissions from DB
    User.findById(req.user.id)
      .select('grantedPermissions deniedPermissions')
      .then((dbUser) => {
        const granted = dbUser?.grantedPermissions ?? []
        const denied = dbUser?.deniedPermissions ?? []
        if (!hasPermissionResolved(req.user!.role as UserRole, permission, granted, denied)) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
        next()
      })
      .catch(() => {
        res.status(500).json({ error: 'Internal server error' })
      })
  }
}

export function requireAnyPermission(permissions: Permission[] = []) {
  return async function permissionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (!(await ensureMfaEnrollment(req, res))) return
    if (req.user.role === 'SUPER_ADMIN') {
      next()
      return
    }
    User.findById(req.user.id)
      .select('grantedPermissions deniedPermissions')
      .then((dbUser) => {
        const granted = dbUser?.grantedPermissions ?? []
        const denied = dbUser?.deniedPermissions ?? []
        const hasAny = permissions.some((perm) =>
          hasPermissionResolved(req.user!.role as UserRole, perm, granted, denied),
        )
        if (!hasAny) {
          res.status(403).json({ error: 'Forbidden' })
          return
        }
        next()
      })
      .catch(() => {
        res.status(500).json({ error: 'Internal server error' })
      })
  }
}
