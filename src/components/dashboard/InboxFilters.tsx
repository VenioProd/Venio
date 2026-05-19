import { InboxItemType } from './types'

export type InboxFilter = 'all' | InboxItemType | 'snoozed'

interface Props {
  value: InboxFilter
  counts: Record<string, number>
  snoozedCount: number
  onChange: (f: InboxFilter) => void
}

const FILTERS: Array<{ k: InboxFilter; label: string }> = [
  { k: 'all', label: 'Tout' },
  { k: 'decision', label: 'Décisions' },
  { k: 'brief', label: 'Briefs P1' },
  { k: 'lead', label: 'CRM' },
  { k: 'message', label: 'Messages' },
  { k: 'ticket', label: 'Tickets' },
  { k: 'task', label: 'Tâches' },
  { k: 'system', label: 'Système' },
  { k: 'pin', label: 'Épinglés' },
]

const InboxFilters = ({ value, counts, snoozedCount, onChange }: Props) => (
  <div className="ix-filters" role="tablist">
    {FILTERS.map((f) => {
      const c = f.k === 'all' ? counts.all : counts[f.k] ?? 0
      return (
        <button
          key={f.k}
          type="button"
          role="tab"
          className={`ix-filter${value === f.k ? ' ix-filter--active' : ''}`}
          onClick={() => onChange(f.k)}
          aria-selected={value === f.k}
        >
          {f.label} {c > 0 && <span className="ix-filter__n">{c}</span>}
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
      ⏰ Snoozées {snoozedCount > 0 && <span className="ix-filter__n">{snoozedCount}</span>}
    </button>
  </div>
)

export default InboxFilters
