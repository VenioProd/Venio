import type { DevIssueStatus, DevIssuePriority, DevIssueType } from '../../../services/dev'

export const STATUS_COLOR: Record<DevIssueStatus, string> = {
  BACKLOG: 'var(--text-muted)',
  TODO: 'var(--text-secondary)',
  IN_PROGRESS: 'var(--primary)',
  IN_REVIEW: 'var(--cat-2)',
  BLOCKED: 'var(--warning)',
  DONE: 'var(--good)',
  DUPLICATE: 'var(--text-muted)',
  CANCELLED: 'var(--text-muted)',
}
export const PRIORITY_COLOR: Record<DevIssuePriority, string> = {
  NO_PRIORITY: 'var(--text-muted)',
  LOW: 'var(--text-secondary)',
  MEDIUM: 'var(--primary)',
  HIGH: 'var(--warning)',
  URGENT: 'var(--critical)',
}
export const TYPE_COLOR: Record<DevIssueType, string> = {
  FEATURE: 'var(--cat-2)',
  BUG: 'var(--critical)',
  CHORE: 'var(--text-secondary)',
  TASK: 'var(--primary)',
  REFACTOR: 'var(--cat-3)',
  SECURITY: 'var(--warning)',
  CI: 'var(--cat-2)',
  DEPLOY: 'var(--good)',
  DOC: 'var(--text-secondary)',
}
