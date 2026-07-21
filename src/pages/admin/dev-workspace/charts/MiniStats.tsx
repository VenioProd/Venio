export type MiniStatTone = 'neutral' | 'critical' | 'serious' | 'good'

export interface MiniStatItem {
  key: string
  label: string
  value: number
  tone: MiniStatTone
}

/** Rangée de mini-stats à côté de l'anneau de complétion (command center). */
export const MiniStats = ({ items }: { items: MiniStatItem[] }) => (
  <div className="dev-viz-ministats">
    {items.map((s) => (
      <div key={s.key} className={`dev-viz-ministat tone-${s.tone}`}>
        <span className="dev-viz-ministat-value">{s.value}</span>
        <span className="dev-viz-ministat-label">{s.label}</span>
      </div>
    ))}
  </div>
)

export default MiniStats
