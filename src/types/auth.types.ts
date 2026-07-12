export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'COMPTABLE' | 'RH' | 'COMMERCIAL' | 'VIEWER' | 'STAGIAIRE'
export type ClientRole = 'CLIENT'
export type UserRole = AdminRole | ClientRole

export type Permission =
  | 'manage_admins'
  | 'manage_clients'
  | 'view_crm'
  | 'manage_crm'
  | 'view_messaging'
  | 'send_messages'
  | 'manage_channels'
  | 'view_projects'
  | 'edit_projects'
  | 'view_content'
  | 'edit_content'
  | 'view_billing'
  | 'manage_billing'
  | 'manage_tasks'
  | 'view_qualiopi'
  | 'manage_qualiopi'
  | 'view_accounting'
  | 'manage_accounting'
  | 'lock_accounting'
  | 'view_vat'
  | 'manage_vat'
  | 'export_fec'
  | 'manage_external_sources'
  | 'view_tickets'
  | 'create_tickets'
  | 'manage_tickets'
  | 'view_dev'
  | 'manage_dev'
  | 'view_education'
  | 'manage_education'

export interface User {
  _id: string
  name: string
  email: string
  role: UserRole
  permissions: Permission[]
  /** Titre affiché à côté du nom (ex: "Stagiaire UX", "CTO"). Optionnel — fallback sur le rôle. */
  title?: string
  jobTitle?: string
  /** Permissions ad-hoc ajoutées par un admin en plus du rôle. */
  customPermissions?: string[]
  grantedPermissions?: string[]
  deniedPermissions?: string[]
  companyName?: string
  phone?: string
  website?: string
  serviceType?: string
  status?: string
  healthStatus?: string
  tags?: string[]
  locale?: 'fr' | 'en'
  colorTheme?:
    | 'sky'
    | 'violet'
    | 'emerald'
    | 'amber'
    | 'rose'
    | 'coral'
    | 'yellow'
    | 'indigo'
    | 'teal'
    | 'fuchsia'
    | 'lime'
    | 'slate'
  avatarUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface LoginResult {
  user?: User | null
  requires2FA?: boolean
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string, totpCode?: string) => Promise<LoginResult>
  logout: () => Promise<void>
  refreshUser: () => Promise<User | null>
}
