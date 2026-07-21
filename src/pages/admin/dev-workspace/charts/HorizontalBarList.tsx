export interface HorizontalBarRow {
  key: string
  label: string
  value: number
  color: string
}

interface HorizontalBarListProps {
  rows: HorizontalBarRow[]
  ariaLabel: string
}

/** Barres horizontales (priorité / modèle créateur) — valeur affichée en bout de barre. */
export const HorizontalBarList = ({ rows, ariaLabel }: HorizontalBarListProps) => {
  if (rows.length === 0) {
    return <div className="dev-viz-empty">Aucune donnée</div>
  }
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="dev-viz-barlist" role="img" aria-label={ariaLabel}>
      {rows.map((r) => (
        <div className="dev-viz-barlist-row" key={r.key}>
          <span className="dev-viz-barlist-label">{r.label}</span>
          <span className="dev-viz-barlist-track">
            <span
              className="dev-viz-barlist-fill"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color }}
            />
          </span>
          <span className="dev-viz-barlist-value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export default HorizontalBarList
