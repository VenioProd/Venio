import { InboxItemType } from './types'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'

export type InboxFilter = 'all' | InboxItemType | 'snoozed'

interface Props {
  value: InboxFilter
  counts: Record<string, number>
  snoozedCount: number
  onChange: (f: InboxFilter) => void
}

const FILTERS: Array<{ k: InboxFilter; label: MessageKey }> = [
  { k: 'all', label: 'shared.dash.filterAll' },
  { k: 'decision', label: 'shared.dash.filterDecisions' },
  { k: 'brief', label: 'shared.dash.filterBriefs' },
  { k: 'lead', label: 'shared.dash.filterCrm' },
  { k: 'message', label: 'shared.dash.filterMessages' },
  { k: 'ticket', label: 'shared.dash.filterTickets' },
  { k: 'task', label: 'shared.dash.filterTasks' },
  { k: 'system', label: 'shared.dash.filterSystem' },
  { k: 'pin', label: 'shared.dash.filterPinned' },
]

const InboxFilters = ({ value, counts, snoozedCount, onChange }: Props) => {
  const { t } = useI18n()
  return (
    <div className="ix-filters" role="tablist">
      {FILTERS.map((f) => {
        const c = f.k === 'all' ? counts.all : (counts[f.k] ?? 0)
        return (
          <button
            key={f.k}
            type="button"
            role="tab"
            className={`ix-filter${value === f.k ? ' ix-filter--active' : ''}`}
            onClick={() => onChange(f.k)}
            aria-selected={value === f.k}
          >
            {t(f.label)} {c > 0 && <span className="ix-filter__n">{c}</span>}
          </button>
        )
      })}
      <button
        type="button"
        role="tab"
        className={`ix-filter${value === 'snoozed' ? ' ix-filter--active' : ''}`}
        onClick={() => onChange('snoozed')}
        aria-selected={value === 'snoozed'}
        style={{ marginLeft: 'auto' }}
      >
        ⏰ {t('shared.dash.filterSnoozed')} {snoozedCount > 0 && <span className="ix-filter__n">{snoozedCount}</span>}
      </button>
    </div>
  )
}

export default InboxFilters
