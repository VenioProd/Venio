export interface StatusSegment {
  key: string
  label: string
  value: number
  color: string
}

interface StatusBreakdownBarProps {
  segments: StatusSegment[]
}

/** Barre horizontale empilée (statuts) — 2px de gap entre segments, légende dessous. */
export const StatusBreakdownBar = ({ segments }: StatusBreakdownBarProps) => {
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) {
    return <div className="dev-viz-empty">Aucune issue</div>
  }
  return (
    <div className="dev-viz-stackbar-wrap">
      <div className="dev-viz-stackbar" role="img" aria-label="Répartition des issues par statut">
        {visible.map((seg) => (
          <span
            key={seg.key}
            className="dev-viz-stackbar-seg"
            style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
            title={`${seg.label} : ${seg.value}`}
          />
        ))}
      </div>
      <ul className="dev-viz-legend">
        {visible.map((seg) => (
          <li key={seg.key}>
            <span className="dev-viz-legend-dot" style={{ background: seg.color }} aria-hidden />
            {seg.label}
            <b>{seg.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default StatusBreakdownBar
