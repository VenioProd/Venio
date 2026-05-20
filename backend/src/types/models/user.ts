import type { Document, Types } from 'mongoose'
import type {
  UserRole, UserSource, ClientStatus, OnboardingStatus, HealthStatus,
} from '../enums.js'

// ─── User ───
export interface IUserAddress {
  line1: string
  line2: string
  city: string
  postalCode: string
  country: string
}

export interface IUser extends Document {
  email: string
  passwordHash: string
  role: UserRole
  name: string
  title: string
  companyName: string
  serviceType: string
  phone: string
  website: string
  address: IUserAddress
  tags: string[]
  source: UserSource
  ownerAdminId: Types.ObjectId | null
  status: ClientStatus
  onboardingStatus: OnboardingStatus
  healthStatus: HealthStatus
  lastContactAt: Date | null
  archivedAt: Date | null
  twoFactorSecret: string | null
  twoFactorEnabled: boolean
  jobTitle: string
  grantedPermissions: string[]
  deniedPermissions: string[]
  passwordChangedAt: Date | null
  lastLoginAt: Date | null
  lastLoginIp: string
  isActive: boolean
  locale: 'fr' | 'en' | null
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
    | null
  agentTokenId?: Types.ObjectId | null
  avatarUrl: string
  createdAt: Date
  updatedAt: Date
}
