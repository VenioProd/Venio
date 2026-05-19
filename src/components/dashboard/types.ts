export type PulseStatusType = 'ok' | 'warn' | 'bad'

export interface PulseCheck {
  id: string
  label: string
  status: PulseStatusType
  detail?: string
}

// types inbox (miroir du backend)
export type InboxItemType = 'decision' | 'brief' | 'lead' | 'message' | 'ticket' | 'task' | 'system' | 'pin'

export type InboxActionKind = 'approve' | 'reject' | 'open' | 'email' | 'snooze' | 'unpin' | 'mark_done' | 'read'

export interface InboxAction {
  kind: InboxActionKind
  label: string
  shortcut?: string
}

export interface InboxTag {
  label: string
  color: string
}

export interface InboxItem {
  id: string
  type: InboxItemType
  sourceId: string
  title: string
  meta: string[]
  urgency: number
  tag: InboxTag
  actions: InboxAction[]
  link?: string
  snoozedUntil?: string
}

export interface InboxResponse {
  items: InboxItem[]
  counts: Record<string, number>
  snoozedCount: number
}
