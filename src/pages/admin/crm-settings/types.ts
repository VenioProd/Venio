import type { AdminUser } from '../../../types/crm.types'

export interface CrmSettingsMessage {
  type: string
  text: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CrmSettingsData = Record<string, any>

export interface AutomationCategory {
  id: string
  label: string
  icon: React.ReactNode
}

export interface SectionProps {
  settings: CrmSettingsData
  canManage: boolean
  updateSetting: (key: string, value: unknown) => Promise<void>
  updateNestedSetting?: (parent: string, key: string, value: unknown) => Promise<void>
  admins?: AdminUser[]
  handleRecipientsChange?: (value: string) => Promise<void>
}
