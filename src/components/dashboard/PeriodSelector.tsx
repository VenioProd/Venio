import { useI18n } from '../../context/I18nContext'

export type Period = '7d' | '30d' | '90d' | 'ytd'

interface PeriodSelectorProps {
  value: Period
  onChange: (p: Period) => void
}

const OPTS: Array<{ k: Period; label: string }> = [
  { k: '7d', label: '7j' },
  { k: '30d', label: '30j' },
  { k: '90d', label: '90j' },
  { k: 'ytd', label: 'YTD' },
]

const PeriodSelector = ({ value, onChange }: PeriodSelectorProps) => {
  const { t } = useI18n()
  return (
    <div className="dash-period" role="group" aria-label={t('shared.dash.periodLabel')}>
      {OPTS.map((o) => (
        <button
          key={o.k}
          type="button"
          className={`dash-period__chip${value === o.k ? ' dash-period__chip--active' : ''}`}
          onClick={() => onChange(o.k)}
          aria-pressed={value === o.k}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default PeriodSelector
