import type { Request, Response, NextFunction } from 'express'
import type { UserRole, Permission } from '../types/enums.js'
import { hasPermission, hasPermissionResolved, isAdminRole } from '../lib/permissions.js'
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
    // For other roles, check customPermissions from DB
    User.findById(req.user.id).select('customPermissions').then((dbUser) => {
      const customPerms = dbUser?.customPermissions ?? null
      if (!hasPermissionResolved(req.user!.role as UserRole, permission, customPerms)) {
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
    User.findById(req.user.id).select('customPermissions').then((dbUser) => {
      const customPerms = dbUser?.customPermissions ?? null
      const hasAny = permissions.some((perm) => hasPermissionResolved(req.user!.role as UserRole, perm, customPerms))
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
