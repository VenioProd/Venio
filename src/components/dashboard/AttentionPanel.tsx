import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'

export type AttentionSeverity = 'critical' | 'serious' | 'warning'

export interface AttentionItem {
  label: string
  count: number
  severity: AttentionSeverity
  to?: string
}

interface Props {
  items: AttentionItem[]
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 3,
  serious: 2,
  warning: 1,
}

const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  critical: 'Critique',
  serious: 'Sérieux',
  warning: 'Attention',
}

/**
 * Liste d'exceptions triée par gravité décroissante — remplace la bannière
 * d'alertes collapsible par une liste plate, toujours visible, avec liseré
 * de gravité + pastille de niveau (jamais la couleur seule).
 */
const AttentionPanel = ({ items }: Props) => {
  const nonZero = items
    .filter((i) => i.count > 0)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count)

  if (nonZero.length === 0) {
    return (
      <div className="dash-attention__empty">
        <CheckCircle2 size={16} style={{ opacity: 0.6, marginBottom: 4 }} />
        <div>Aucune exception en cours — tout est sous contrôle.</div>
      </div>
    )
  }

  return (
    <div className="dash-attention">
      {nonZero.map((item) => {
        const inner = (
          <div
            className="dash-attention__row"
            style={{
              borderLeftColor: `var(--${item.severity === 'critical' ? 'critical' : item.severity === 'serious' ? 'serious' : 'warning'})`,
            }}
          >
            <span className="dash-attention__label">{item.label}</span>
            <span className={`dash-pill dash-pill--${item.severity}`}>{SEVERITY_LABEL[item.severity]}</span>
            <span className="dash-attention__count">{item.count}</span>
          </div>
        )
        return item.to ? (
          <Link key={item.label} to={item.to} className="dash-attention__link">
            {inner}
          </Link>
        ) : (
          <div key={item.label}>{inner}</div>
        )
      })}
    </div>
  )
}

export default AttentionPanel
