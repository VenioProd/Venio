import type { AdminUser } from '../../../types/crm.types'
import type { MessageKey } from '../../../i18n'

export interface CrmSettingsMessage {
  type: string
  text: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CrmSettingsData = Record<string, any>

export interface AutomationCategory {
  id: string
  labelKey: MessageKey
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

export interface CallAiProps {
  settings: CrmSettingsData
  /** Ce que ce serveur sait faire ; `null` tant que le serveur n'a pas répondu. */
  providers: import('./callAiModel').Providers | null
  canManage: boolean
  /** Enregistre un bloc en entier ; renvoie le message du serveur en cas de refus, sinon `null`. */
  saveBlock: (name: string, value: unknown) => Promise<string | null>
}
