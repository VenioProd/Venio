export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER'
export type ClientRole = 'CLIENT'
export type UserRole = AdminRole | ClientRole

export type Permission =
  | 'manage_admins'
  | 'manage_clients'
  | 'view_crm'
  | 'manage_crm'
  | 'view_projects'
  | 'edit_projects'
  | 'view_content'
  | 'edit_content'
  | 'view_billing'
  | 'manage_billing'
  | 'view_tickets'
  | 'create_tickets'
  | 'manage_tickets'

export interface User {
  _id: string
  name: string
  email: string
  role: UserRole
  permissions: Permission[]
  companyName?: string
  phone?: string
  website?: string
  serviceType?: string
  status?: string
  healthStatus?: string
  createdAt?: string
  updatedAt?: string
}

export interface LoginResult {
  token?: string
  user?: User | null
  requires2FA?: boolean
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string, totpCode?: string) => Promise<LoginResult>
  logout: () => void
  refreshUser: () => Promise<User | null>
}
