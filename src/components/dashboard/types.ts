export type PulseStatusType = 'ok' | 'warn' | 'bad'

export interface PulseCheck {
  id: string
  label: string
  status: PulseStatusType
  detail?: string
}
