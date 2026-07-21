export interface StatusSegment {
  key: string
  label: string
  count: number
  color: string
}

interface Props {
  segments: StatusSegment[]
}

/**
 * Barre horizontale empilée — une seule barre segmentée (2px de gap entre
 * segments) + légende dessous (pastille + label + compte). La couleur ne
 * porte jamais seule l'information : chaque segment a un libellé + un
 * compte associés dans la légende.
 */
const StackedStatusBar = ({ segments }: Props) => {
  const total = segments.reduce((sum, s) => sum + s.count, 0)
  const visible = segments.filter((s) => s.count > 0)

  if (total === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun projet</p>
  }

  return (
    <div>
      <div className="dash-status-bar" role="img" aria-label="Répartition des projets par statut">
        {visible.map((s) => (
          <div
            key={s.key}
            className="dash-status-bar__segment"
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label} · ${s.count}`}
          />
        ))}
      </div>
      <div className="dash-status-bar__legend">
        {visible.map((s) => (
          <div key={s.key} className="dash-status-bar__legend-item">
            <span className="dash-status-bar__legend-dot" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="dash-status-bar__legend-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StackedStatusBar
