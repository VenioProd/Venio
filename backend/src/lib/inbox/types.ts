export type InboxItemType = 'decision' | 'brief' | 'lead' | 'message' | 'ticket' | 'task' | 'system' | 'pin'

export type InboxActionKind =
  | 'approve'
  | 'reject'
  | 'open'
  | 'email'
  | 'snooze'
  | 'unpin'
  | 'mark_done'
  | 'read'

export interface InboxAction {
  kind: InboxActionKind
  label: string
  shortcut?: string
}

export interface InboxTag {
  label: string  // 'URG' | 'P1' | 'CRM' | 'MSG' | 'TKT' | 'TSK' | 'SYS' | 'PIN'
  color: string  // hex
}

export interface InboxItem {
  id: string                  // composite: `${type}:${sourceId}`
  type: InboxItemType
  sourceId: string
  title: string
  meta: string[]
  urgency: number             // 0-100
  tag: InboxTag
  actions: InboxAction[]
  link?: string
  snoozedUntil?: string       // ISO date
}
