import React from 'react'
import type { TimelineEntry as Entry } from '../../../types/interaction.types'
import { useI18n } from '../../../context/I18nContext'
import { DELIVERY_LABEL_KEYS, KIND_MAP, SYSTEM_KIND, formatOccurredAt } from './constants'

interface TimelineEntryProps {
  entry: Entry
  canWrite: boolean
  busy: boolean
  onDelete: (id: string) => void
  onTogglePin: (entry: Entry) => void
}

const TimelineEntryRow: React.FC<TimelineEntryProps> = ({ entry, canWrite, busy, onDelete, onTogglePin }) => {
  const { t } = useI18n()
  const isSystem = entry.source === 'SYSTEM'
  const kind = isSystem ? SYSTEM_KIND : KIND_MAP[entry.kind] || SYSTEM_KIND
  const failed = entry.recipients.filter((recipient) => recipient.status === 'FAILED')

  return (
    <li className={`interaction-entry ${isSystem ? 'is-system' : ''} ${entry.pinned ? 'is-pinned' : ''}`}>
      <span className="interaction-badge" style={{ '--kind-color': kind.color } as React.CSSProperties}>
        {t(kind.badgeKey)}
      </span>

      <div className="interaction-body">
        <div className="interaction-head">
          <span className="interaction-label">{entry.label}</span>
          {entry.direction === 'IN' && <span className="interaction-chip">{t('compB.timeline.received')}</span>}
          {entry.pinned && <span className="interaction-chip is-pinned-chip">{t('compB.timeline.pinned')}</span>}
          {entry.deliveryStatus !== 'NONE' && entry.deliveryStatus !== 'SENT' && (
            <span className="interaction-chip is-warning">
              {DELIVERY_LABEL_KEYS[entry.deliveryStatus]
                ? t(DELIVERY_LABEL_KEYS[entry.deliveryStatus])
                : entry.deliveryStatus}
            </span>
          )}
        </div>

        <p className="interaction-meta">
          {formatOccurredAt(entry.occurredAt)}
          {entry.author ? ` · ${entry.author.name || entry.author.email}` : ''}
          {entry.recipients.length > 0
            ? t('compB.timeline.recipientsTo', {
                emails: entry.recipients.map((recipient) => recipient.email).join(', '),
              })
            : ''}
        </p>

        {entry.body && entry.body !== entry.label && <p className="interaction-content">{entry.body}</p>}

        {failed.length > 0 && (
          <ul className="interaction-failures">
            {failed.map((recipient) => (
              <li key={recipient.email}>
                {recipient.email} — {recipient.error || t('compB.timeline.notDelivered')}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && !isSystem && (
        <div className="interaction-actions">
          <button type="button" onClick={() => onTogglePin(entry)} disabled={busy}>
            {entry.pinned ? t('compB.timeline.unpin') : t('compB.timeline.pin')}
          </button>
          <button type="button" onClick={() => onDelete(entry.id)} disabled={busy}>
            {t('common.delete')}
          </button>
        </div>
      )}
    </li>
  )
}

export default TimelineEntryRow
