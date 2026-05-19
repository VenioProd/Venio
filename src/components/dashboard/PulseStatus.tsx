import type { PulseCheck } from './types'

interface Props {
  checks: PulseCheck[]
}

const PulseStatus = ({ checks }: Props) => {
  const counts = checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
    {} as Record<string, number>
  )

  return (
    <div className="dash-pulse">
      <div className="dash-pulse__header">
        <span className="dash-pulse__title">● PULSE VENIO</span>
        <span className="dash-pulse__count">
          {checks.length} checks · <span className="dash-pulse__count-ok">{counts.ok ?? 0} ok</span> · <span className="dash-pulse__count-warn">{counts.warn ?? 0} warn</span> · <span className="dash-pulse__count-bad">{counts.bad ?? 0} bad</span>
        </span>
      </div>
      <div className="dash-pulse__list">
        {checks.map((c) => (
          <div key={c.id} className={`dash-pulse__row dash-pulse__row--${c.status}`}>
            <span className={`dash-pulse__dot dash-pulse__dot--${c.status}`} aria-hidden />
            <span className="dash-pulse__label">{c.label}</span>
            {c.detail && <span className="dash-pulse__detail">{c.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PulseStatus
