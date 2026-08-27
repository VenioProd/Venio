import type { InteractionKind } from '../../../types/interaction.types'

export interface KindConfig {
  key: InteractionKind
  label: string
  /** Pastille affichée dans la timeline : courte, pour rester lisible. */
  badge: string
  color: string
}

export const INTERACTION_KINDS: KindConfig[] = [
  { key: 'EMAIL', label: 'Email', badge: 'MAIL', color: '#0ea5e9' },
  { key: 'CALL', label: 'Appel', badge: 'APPEL', color: '#8b5cf6' },
  { key: 'MEETING', label: 'Rendez-vous', badge: 'RDV', color: '#f59e0b' },
  { key: 'NOTE', label: 'Note', badge: 'NOTE', color: '#64748b' },
]

export const KIND_MAP: Record<string, KindConfig> = Object.fromEntries(
  INTERACTION_KINDS.map((kind) => [kind.key, kind]),
)

export const SYSTEM_KIND: KindConfig = {
  key: 'NOTE',
  label: 'Système',
  badge: 'SYS',
  color: '#475569',
}

/** Les types qu'on peut consigner à la main. Un email sortant part de son propre composeur. */
export const LOGGABLE_KINDS: KindConfig[] = INTERACTION_KINDS.filter((kind) => kind.key !== 'EMAIL')

export type TimelineFilter = 'ALL' | InteractionKind | 'SYSTEM'

export const TIMELINE_FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'ALL', label: 'Tout' },
  { key: 'EMAIL', label: 'Emails' },
  { key: 'CALL', label: 'Appels' },
  { key: 'MEETING', label: 'RDV' },
  { key: 'NOTE', label: 'Notes' },
  { key: 'SYSTEM', label: 'Système' },
]

export const DELIVERY_LABELS: Record<string, string> = {
  SENT: 'Envoyé',
  PARTIAL: 'Partiellement envoyé',
  FAILED: "Échec d'envoi",
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatOccurredAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}
