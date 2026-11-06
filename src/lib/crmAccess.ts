import type { User } from '../types/auth.types'

/**
 * Miroir de administersCrm (backend/src/lib/crmScope.ts) : seuls le super-admin et l'administrateur
 * modifient les réglages CRM, administrent les règles d'automatisation et valident leurs exécutions.
 * Les autres rôles disposant de manage_crm gardent la gestion des leads, sans ces actions.
 */
export function canAdministerCrm(user: User | null | undefined): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
}
