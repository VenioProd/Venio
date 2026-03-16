// ─────────────────────────────────────────────────────────────
// Automation Engine — Types & Interfaces
// ─────────────────────────────────────────────────────────────

import type { Types } from 'mongoose'

// ── Trigger types ──────────────────────────────────────────
export type TriggerType = 'event' | 'cron' | 'status_change' | 'threshold' | 'health_check'
export type Channel = 'in_app' | 'email' | 'system_log'
export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DEAD_LETTER'
export type RecipientStrategy =
  | 'assigned_user'
  | 'project_manager'
  | 'lead_owner'
  | 'admins'
  | 'super_admins'
  | 'rh'
  | 'client_contact'
  | 'all_internal_active'
  | 'custom'

// ── Automation definition (declared in registry) ───────────
export interface AutomationDefinition {
  key: string
  title: string
  domain: string
  triggerType: TriggerType
  schedule?: string                           // cron expression or time string for cron triggers
  channels: Channel[]
  recipientStrategy: RecipientStrategy[]
  retryable: boolean
  maxRetries: number
  defaultEnabled: boolean
  permissionsScope: string[]

  /** Build idempotency key from context */
  buildIdempotencyKey: (ctx: AutomationContext) => string

  /** Evaluate whether the automation should run */
  evaluate: (ctx: AutomationContext) => Promise<boolean>

  /** Execute the automation actions */
  execute: (ctx: AutomationContext) => Promise<AutomationResult>
}

// ── Runtime context passed to evaluate/execute ─────────────
export interface AutomationContext {
  now: Date
  dateKey: string                             // YYYY-MM-DD
  weekKey: string                             // YYYY-WXX
  monthKey: string                            // YYYY-MM
  settings: AutomationSettingsDoc
  meta?: Record<string, unknown>              // extra event data
}

// ── Result returned by execute ─────────────────────────────
export interface AutomationResult {
  actionsExecuted: string[]
  recipientsNotified: string[]
  details?: Record<string, unknown>
}

// ── Settings document (per automation key) ─────────────────
export interface AutomationSettingsDoc {
  key: string
  enabled: boolean
  channels: Channel[]
  throttleWindowMinutes: number
  escalationEnabled: boolean
  config: Record<string, unknown>             // key-specific config
  updatedAt: Date
}

// ── Execution log document ─────────────────────────────────
export interface AutomationLogDoc {
  automationKey: string
  executionType: TriggerType
  triggerSource: string
  entityType?: string
  entityId?: string
  idempotencyKey: string
  status: ExecutionStatus
  startedAt: Date
  finishedAt?: Date
  durationMs?: number
  errorMessage?: string
  actionsExecuted: string[]
  recipientsNotified: string[]
  retryCount: number
  payload?: Record<string, unknown>
}

// ── Lock document (idempotency) ────────────────────────────
export interface AutomationLockDoc {
  idempotencyKey: string
  automationKey: string
  status: ExecutionStatus
  createdAt: Date
  expiresAt: Date
}

// ── Event payload (for event-driven triggers) ──────────────
export interface AutomationEvent {
  type: string                                // e.g. 'project.status.changed'
  entityType: string                          // e.g. 'project'
  entityId: string
  actor?: string | Types.ObjectId
  data?: Record<string, unknown>
  previousData?: Record<string, unknown>
  timestamp: Date
}

// ── Dispatcher target ──────────────────────────────────────
export interface DispatchTarget {
  userId: string
  email?: string
  name?: string
  channel: Channel
}

export interface DispatchPayload {
  automationKey: string
  title: string
  message: string
  link?: string
  targets: DispatchTarget[]
  metadata?: Record<string, unknown>
}
