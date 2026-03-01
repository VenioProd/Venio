import type { Request, Response, NextFunction } from 'express'
import type { UserRole, Permission } from '../types/enums.js'
import { hasPermission, isAdminRole } from '../lib/permissions.js'

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
    if (!req.user || !hasPermission(req.user.role, permission)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

export function requireAnyPermission(permissions: Permission[] = []) {
  return function permissionMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || !permissions.some((permission) => hasPermission(req.user!.role, permission))) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
