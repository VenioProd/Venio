import type { InteractionKind } from '../../../types/interaction.types'
import { formatDateTime } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

export interface KindConfig {
  key: InteractionKind
  labelKey: MessageKey
  /** Pastille affichée dans la timeline : courte, pour rester lisible. */
  badgeKey: MessageKey
  color: string
}

export const INTERACTION_KINDS: KindConfig[] = [
  { key: 'EMAIL', labelKey: 'compB.timeline.kindEmail', badgeKey: 'compB.timeline.badgeEmail', color: '#0ea5e9' },
  { key: 'CALL', labelKey: 'compB.timeline.kindCall', badgeKey: 'compB.timeline.badgeCall', color: '#8b5cf6' },
  { key: 'MEETING', labelKey: 'compB.timeline.kindMeeting', badgeKey: 'compB.timeline.badgeMeeting', color: '#f59e0b' },
  { key: 'NOTE', labelKey: 'compB.timeline.kindNote', badgeKey: 'compB.timeline.badgeNote', color: '#64748b' },
]

export const KIND_MAP: Record<string, KindConfig> = Object.fromEntries(
  INTERACTION_KINDS.map((kind) => [kind.key, kind]),
)

export const SYSTEM_KIND: KindConfig = {
  key: 'NOTE',
  labelKey: 'compB.timeline.kindSystem',
  badgeKey: 'compB.timeline.badgeSystem',
  color: '#475569',
}

/** Les types qu'on peut consigner à la main. Un email sortant part de son propre composeur. */
export const LOGGABLE_KINDS: KindConfig[] = INTERACTION_KINDS.filter((kind) => kind.key !== 'EMAIL')

export type TimelineFilter = 'ALL' | InteractionKind | 'SYSTEM'

export const TIMELINE_FILTERS: { key: TimelineFilter; labelKey: MessageKey }[] = [
  { key: 'ALL', labelKey: 'compB.timeline.filterAll' },
  { key: 'EMAIL', labelKey: 'compB.timeline.filterEmail' },
  { key: 'CALL', labelKey: 'compB.timeline.filterCall' },
  { key: 'MEETING', labelKey: 'compB.timeline.filterMeeting' },
  { key: 'NOTE', labelKey: 'compB.timeline.filterNote' },
  { key: 'SYSTEM', labelKey: 'compB.timeline.filterSystem' },
]

export const DELIVERY_LABEL_KEYS: Record<string, MessageKey> = {
  SENT: 'compB.timeline.deliverySent',
  PARTIAL: 'compB.timeline.deliveryPartial',
  FAILED: 'compB.timeline.deliveryFailed',
}

export function formatOccurredAt(value: string): string {
  return formatDateTime(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
