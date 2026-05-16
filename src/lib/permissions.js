export const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER']

export const PERMISSIONS = {
  MANAGE_ADMINS: 'manage_admins',
  MANAGE_CLIENTS: 'manage_clients',
  VIEW_CRM: 'view_crm',
  MANAGE_CRM: 'manage_crm',
  VIEW_PROJECTS: 'view_projects',
  EDIT_PROJECTS: 'edit_projects',
  VIEW_CONTENT: 'view_content',
  EDIT_CONTENT: 'edit_content',
  VIEW_BILLING: 'view_billing',
  MANAGE_BILLING: 'manage_billing',
  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  LOCK_ACCOUNTING: 'lock_accounting',
  VIEW_VAT: 'view_vat',
  MANAGE_VAT: 'manage_vat',
  EXPORT_FEC: 'export_fec',
  MANAGE_EXTERNAL_SOURCES: 'manage_external_sources',
}

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: new Set(Object.values(PERMISSIONS)),
  ADMIN: new Set([
    PERMISSIONS.MANAGE_CLIENTS,
    PERMISSIONS.VIEW_CRM,
    PERMISSIONS.MANAGE_CRM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.EDIT_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.EDIT_CONTENT,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.MANAGE_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
    PERMISSIONS.MANAGE_VAT,
    PERMISSIONS.EXPORT_FEC,
  ]),
  VIEWER: new Set([
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_CONTENT,
    PERMISSIONS.VIEW_BILLING,
    PERMISSIONS.VIEW_ACCOUNTING,
    PERMISSIONS.VIEW_VAT,
  ]),
  CLIENT: new Set([]),
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role)
}

export function getPermissionsForRole(role) {
  const rolePermissions = ROLE_PERMISSIONS[role]
  if (!rolePermissions) return []
  return Array.from(rolePermissions)
}

export function resolveUserPermissions(user) {
  if (!user) return []
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions
  }
  return getPermissionsForRole(user.role)
}

export function hasPermission(user, permission) {
  const permissions = resolveUserPermissions(user)
  return permissions.includes(permission)
}
