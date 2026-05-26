import type { Request, Response, NextFunction } from 'express'
import type { UserRole, Permission } from '../types/enums.js'
import { hasPermissionResolved, isAdminRole } from '../lib/permissions.js'
import User from '../models/User.js'

export default function requireRole(role: UserRole) {
  return function roleMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== role) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !isAdminRole(req.user.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export function requirePermission(permission: Permission) {
  return function permissionMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    // SUPER_ADMIN bypasses everything
    if (req.user.role === 'SUPER_ADMIN') {
      next()
      return
    }
    // For other roles, check grantedPermissions/deniedPermissions from DB
    User.findById(req.user.id).select('grantedPermissions deniedPermissions').then((dbUser) => {
      const granted = dbUser?.grantedPermissions ?? []
      const denied = dbUser?.deniedPermissions ?? []
      if (!hasPermissionResolved(req.user!.role as UserRole, permission, granted, denied)) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      next()
    }).catch(() => {
      res.status(500).json({ error: 'Internal server error' })
    })
  }
}

export function requireAnyPermission(permissions: Permission[] = []) {
  return function permissionMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (req.user.role === 'SUPER_ADMIN') {
      next()
      return
    }
    User.findById(req.user.id).select('grantedPermissions deniedPermissions').then((dbUser) => {
      const granted = dbUser?.grantedPermissions ?? []
      const denied = dbUser?.deniedPermissions ?? []
      const hasAny = permissions.some((perm) => hasPermissionResolved(req.user!.role as UserRole, perm, granted, denied))
      if (!hasAny) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      next()
    }).catch(() => {
      res.status(500).json({ error: 'Internal server error' })
    })
  }
}
