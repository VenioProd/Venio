export type InteractionSubjectType = 'LEAD' | 'CLIENT'
export type InteractionKind = 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE'
export type InteractionDirection = 'OUT' | 'IN' | 'NONE'
export type InteractionDeliveryStatus = 'NONE' | 'SENT' | 'PARTIAL' | 'FAILED'

/** `INTERACTION` : un échange, éditable. `SYSTEM` : un événement, en lecture seule. */
export type TimelineSource = 'INTERACTION' | 'SYSTEM'

export interface TimelineAuthor {
  _id: string
  name: string
  email: string
}

export interface TimelineRecipient {
  email: string
  name: string
  status: string
  error: string
}

export interface TimelineEntry {
  id: string
  source: TimelineSource
  kind: string
  direction: string
  occurredAt: string
  label: string
  body: string
  pinned: boolean
  author: TimelineAuthor | null
  recipients: TimelineRecipient[]
  deliveryStatus: InteractionDeliveryStatus
}

export interface TimelineSubject {
  type: InteractionSubjectType
  id: string
  label: string
  contactEmail: string
  contactName: string
}

export interface TimelineResponse {
  entries: TimelineEntry[]
  hasMore: boolean
  limit: number
  subject: TimelineSubject
}

export interface LogInteractionInput {
  kind: InteractionKind
  direction?: InteractionDirection
  occurredAt?: string
  subject?: string
  body: string
}

export interface SendEmailInput {
  subject: string
  body: string
  recipients?: string[]
}

export interface SendEmailResult {
  sent: number
  failed: number
  total: number
  results: { email: string; name: string; success: boolean; error?: string }[]
}
