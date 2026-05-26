import {
  CircleDashed,
  Circle,
  CircleDot,
  CircleCheck,
  CircleX,
  Loader,
  AlertOctagon,
  Signal,
  Sparkles,
  Bug,
  Wrench,
  ListChecks,
} from 'lucide-react'
import type {
  DevIssueStatus,
  DevIssuePriority,
  DevIssueType,
  UserRef,
} from '@/services/dev'
import { STATUS_COLOR, PRIORITY_COLOR } from '@/services/dev'

export type StatusIcon = React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number | string; className?: string }>

export const STATUS_ICON: Record<DevIssueStatus, StatusIcon> = {
  BACKLOG: CircleDashed,
  TODO: Circle,
  IN_PROGRESS: Loader,
  IN_REVIEW: CircleDot,
  DONE: CircleCheck,
  CANCELLED: CircleX,
}

export const TYPE_ICON: Record<DevIssueType, StatusIcon> = {
  FEATURE: Sparkles,
  BUG: Bug,
  CHORE: Wrench,
  TASK: ListChecks,
}

export function PriorityIcon({
  priority,
  size = 14,
}: {
  priority: DevIssuePriority
  size?: number
}) {
  const color = PRIORITY_COLOR[priority]
  if (priority === 'URGENT') {
    return <AlertOctagon size={size} color={color} strokeWidth={2.4} />
  }
  if (priority === 'NO_PRIORITY') {
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: size,
          height: 2,
          background: color,
          opacity: 0.6,
          borderRadius: 1,
        }}
      />
    )
  }
  // 3 bars: HIGH=3, MEDIUM=2, LOW=1
  const bars = priority === 'HIGH' ? 3 : priority === 'MEDIUM' ? 2 : 1
  return (
    <span
      aria-hidden
      title={priority}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1.5,
        height: size,
        width: size,
      }}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: size / 4.5,
            height: `${(i / 3) * 100}%`,
            background: i <= bars ? color : 'rgba(148,163,184,0.25)',
            borderRadius: 1,
          }}
        />
      ))}
      {/* fallback if Signal lucide preferred elsewhere */}
      <Signal style={{ display: 'none' }} />
    </span>
  )
}

export function StatusGlyph({ status, size = 14 }: { status: DevIssueStatus; size?: number }) {
  const Icon = STATUS_ICON[status]
  const color = STATUS_COLOR[status]
  const spin = status === 'IN_PROGRESS'
  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={2}
      className={spin ? 'dev-spin' : undefined}
    />
  )
}

export function TypeBadge({ type, size = 12 }: { type: DevIssueType; size?: number }) {
  const Icon = TYPE_ICON[type]
  return <Icon size={size} />
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const now = Date.now()
  const diff = now - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function userInitial(u: UserRef | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export function Avatar({ user, size = 22 }: { user: UserRef | null | undefined; size?: number }) {
  const filled = !!user
  return (
    <span
      className={`dev-avatar${filled ? ' filled' : ''}`}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.45) }}
      title={user?.name || user?.email || 'Non assigné'}
    >
      {user ? userInitial(user) : '?'}
    </span>
  )
}
