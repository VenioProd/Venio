import type { MessageKey } from '../i18n'
import { PERMISSIONS } from './permissions'

/**
 * Catalogue d'affichage du formulaire d'invitation d'un membre : rôles
 * proposables, regroupement des droits par module, écart avec les droits du
 * rôle. Les droits eux-mêmes viennent de `rbac-matrix.json` (via ./permissions) ;
 * ce fichier ne fait que les présenter.
 */

/**
 * Rôles proposables à la création, regroupés comme ils s'affichent.
 * SUPER_ADMIN n'y figure pas : le compte est unique et le serveur refuse d'en
 * créer un second. AGENT et CLIENT non plus : ce ne sont pas des membres.
 */
export const INVITABLE_ROLE_GROUPS: ReadonlyArray<{ id: string; label: MessageKey; roles: readonly string[] }> = [
  { id: 'management', label: 'projects.admin.invite.group.management', roles: ['ADMIN', 'MANAGER'] },
  {
    id: 'business',
    label: 'projects.admin.invite.group.business',
    roles: ['COMMERCIAL', 'COMPTABLE', 'RH', 'STAGIAIRE'],
  },
  { id: 'readonly', label: 'projects.admin.invite.group.readonly', roles: ['VIEWER'] },
  { id: 'external', label: 'projects.admin.invite.group.external', roles: ['COMMERCIAL_EXTERNE'] },
]

export const INVITABLE_ROLES: readonly string[] = INVITABLE_ROLE_GROUPS.flatMap((group) => group.roles)

export const ROLE_TEXT: Record<string, { label: MessageKey; description: MessageKey }> = {
  ADMIN: { label: 'projects.admin.role.contributor', description: 'projects.admin.invite.roleDesc.admin' },
  MANAGER: { label: 'projects.admin.invite.role.manager', description: 'projects.admin.invite.roleDesc.manager' },
  COMMERCIAL: { label: 'projects.admin.role.sales', description: 'projects.admin.invite.roleDesc.sales' },
  COMPTABLE: {
    label: 'projects.admin.invite.role.accountant',
    description: 'projects.admin.invite.roleDesc.accountant',
  },
  RH: { label: 'projects.admin.role.hr', description: 'projects.admin.invite.roleDesc.hr' },
  STAGIAIRE: { label: 'projects.admin.role.intern', description: 'projects.admin.invite.roleDesc.intern' },
  VIEWER: { label: 'projects.admin.role.viewer', description: 'projects.admin.invite.roleDesc.viewer' },
  COMMERCIAL_EXTERNE: {
    label: 'projects.admin.role.externalSales',
    description: 'projects.admin.invite.roleDesc.external',
  },
}

export type AccessLevel = 'none' | 'read' | 'write'

interface PermissionEntry {
  /** Valeur de la permission, telle que le serveur la connaît. */
  permission: string
  label: MessageKey
  /** Modifie, crée ou supprime : par opposition à la simple lecture. */
  write: boolean
}

export interface AccessModule {
  id: string
  label: MessageKey
  permissions: readonly PermissionEntry[]
}

const entry = (key: keyof typeof PERMISSIONS, label: MessageKey, write: boolean): PermissionEntry => ({
  permission: PERMISSIONS[key],
  label,
  write,
})

export const ACCESS_MODULES: readonly AccessModule[] = [
  {
    id: 'crm',
    label: 'projects.admin.invite.module.crm',
    permissions: [
      entry('VIEW_CRM', 'projects.admin.perm.viewCrm', false),
      entry('MANAGE_CRM', 'projects.admin.perm.manageCrm', true),
      entry('MANAGE_CLIENTS', 'projects.admin.perm.manageClients', true),
      entry('MANAGE_QUOTES', 'projects.admin.perm.manageQuotes', true),
    ],
  },
  {
    id: 'projects',
    label: 'projects.admin.invite.module.projects',
    permissions: [
      entry('VIEW_PROJECTS', 'projects.admin.perm.viewProjects', false),
      entry('EDIT_PROJECTS', 'projects.admin.perm.editProjects', true),
      entry('VIEW_CONTENT', 'projects.admin.perm.viewContent', false),
      entry('EDIT_CONTENT', 'projects.admin.perm.editContent', true),
      entry('UPLOAD_PROJECT_DOCUMENTS', 'projects.admin.perm.uploadDocs', true),
      entry('VIEW_PHASES', 'projects.admin.perm.viewPhases', false),
      entry('MANAGE_PHASES', 'projects.admin.perm.managePhases', true),
      entry('VIEW_CHANGE_REQUESTS', 'projects.admin.perm.viewChangeRequests', false),
      entry('MANAGE_CHANGE_REQUESTS', 'projects.admin.perm.manageChangeRequests', true),
    ],
  },
  {
    id: 'billing',
    label: 'projects.admin.invite.module.billing',
    permissions: [
      entry('VIEW_BILLING', 'projects.admin.perm.viewBilling', false),
      entry('MANAGE_BILLING', 'projects.admin.perm.manageBilling', true),
    ],
  },
  {
    id: 'accounting',
    label: 'projects.admin.invite.module.accounting',
    permissions: [
      entry('VIEW_ACCOUNTING', 'projects.admin.perm.viewAccounting', false),
      entry('MANAGE_ACCOUNTING', 'projects.admin.perm.manageAccounting', true),
      entry('LOCK_ACCOUNTING', 'projects.admin.perm.lockAccounting', true),
      entry('VIEW_VAT', 'projects.admin.perm.viewVat', false),
      entry('MANAGE_VAT', 'projects.admin.perm.manageVat', true),
      entry('EXPORT_FEC', 'projects.admin.perm.exportFec', true),
      entry('MANAGE_EXTERNAL_SOURCES', 'projects.admin.perm.manageExternalSources', true),
    ],
  },
  {
    id: 'messaging',
    label: 'projects.admin.invite.module.messaging',
    permissions: [
      entry('VIEW_MESSAGING', 'projects.admin.perm.viewMessaging', false),
      entry('SEND_MESSAGES', 'projects.admin.perm.sendMessages', true),
      entry('MANAGE_CHANNELS', 'projects.admin.perm.manageChannels', true),
    ],
  },
  {
    id: 'tasks',
    label: 'projects.admin.invite.module.tasks',
    permissions: [
      entry('MANAGE_TASKS', 'projects.admin.perm.manageTasks', true),
      entry('VIEW_TICKETS', 'projects.admin.perm.viewTickets', false),
      entry('CREATE_TICKETS', 'projects.admin.perm.createTickets', true),
      entry('MANAGE_TICKETS', 'projects.admin.perm.manageTickets', true),
    ],
  },
  {
    id: 'qualiopi',
    label: 'projects.admin.invite.module.qualiopi',
    permissions: [
      entry('VIEW_QUALIOPI', 'projects.admin.perm.viewQualiopi', false),
      entry('MANAGE_QUALIOPI', 'projects.admin.perm.manageQualiopi', true),
    ],
  },
  {
    id: 'dev',
    label: 'projects.admin.invite.module.dev',
    permissions: [
      entry('VIEW_DEV', 'projects.admin.perm.viewDev', false),
      entry('SUBMIT_DEV_SUGGESTION', 'projects.admin.perm.submitDevSuggestion', false),
      entry('MANAGE_DEV', 'projects.admin.perm.manageDev', true),
      entry('VIEW_BETA', 'projects.admin.perm.viewBeta', false),
      entry('MANAGE_BETA', 'projects.admin.perm.manageBeta', true),
    ],
  },
  {
    id: 'education',
    label: 'projects.admin.invite.module.education',
    permissions: [
      entry('VIEW_EDUCATION', 'projects.admin.perm.viewEducation', false),
      entry('MANAGE_EDUCATION', 'projects.admin.perm.manageEducation', true),
    ],
  },
  {
    id: 'webhooks',
    label: 'projects.admin.invite.module.webhooks',
    permissions: [
      entry('VIEW_WEBHOOKS', 'projects.admin.perm.viewWebhooks', false),
      entry('MANAGE_WEBHOOKS', 'projects.admin.perm.manageWebhooks', true),
    ],
  },
  {
    id: 'team',
    label: 'projects.admin.invite.module.team',
    permissions: [
      entry('MANAGE_ADMINS', 'projects.admin.perm.manageAdmins', true),
      entry('MANAGE_EXTERNAL_SALES', 'projects.admin.perm.manageExternalSales', true),
    ],
  },
]

/** Niveau d'accès d'un module pour un jeu de droits : le plus haut droit accordé l'emporte. */
export function moduleLevel(module: AccessModule, granted: ReadonlySet<string>): AccessLevel {
  const held = module.permissions.filter((item) => granted.has(item.permission))
  if (held.some((item) => item.write)) return 'write'
  return held.length > 0 ? 'read' : 'none'
}

/**
 * Écart entre les droits choisis et ceux du rôle, tel que le serveur le stocke :
 * `grantedPermissions` ajoute à ceux du rôle, `deniedPermissions` en retire.
 */
export function permissionOverrides(roleDefaults: readonly string[], selected: readonly string[]) {
  const defaults = new Set(roleDefaults)
  const chosen = new Set(selected)
  return {
    grantedPermissions: selected.filter((permission) => !defaults.has(permission)),
    deniedPermissions: roleDefaults.filter((permission) => !chosen.has(permission)),
  }
}

// Sans I, O, l, 0 ni 1 : le mot de passe se dicte et se recopie sans ambiguïté.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** Mot de passe provisoire tiré du générateur cryptographique du navigateur. */
export function generatePassword(length = 14): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let password = ''
  while (password.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const byte of bytes) {
      if (byte < limit && password.length < length) password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
    }
  }
  return password
}
