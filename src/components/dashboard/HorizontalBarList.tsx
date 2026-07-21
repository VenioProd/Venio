export interface HorizontalBarItem {
  key: string
  label: string
  value: number
  hint?: string
}

interface Props {
  items: HorizontalBarItem[]
  color: string
}

/**
 * Barres horizontales — une couleur d'accent unique, magnitude portée par la
 * longueur de la barre, valeur en bout de barre (jamais la couleur seule).
 */
const HorizontalBarList = ({ items, color }: Props) => {
  const max = Math.max(1, ...items.map((i) => i.value))

  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucune donnée</p>
  }

  return (
    <div className="dash-hbar-list">
      {items.map((item) => (
        <div key={item.key} className="dash-hbar-row">
          <span className="dash-hbar-row__label" title={item.label}>
            {item.label}
            {item.hint && <span className="dash-hbar-row__overdue">{item.hint}</span>}
          </span>
          <span className="dash-hbar-row__track">
            <span
              className="dash-hbar-row__fill"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </span>
          <span className="dash-hbar-row__value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export default HorizontalBarList
