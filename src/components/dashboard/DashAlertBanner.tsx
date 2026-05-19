import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

export interface AlertItem {
  label: string
  count: number
  to?: string
  tone?: 'danger' | 'warning'
}

interface Props {
  alerts: AlertItem[]
  defaultOpen?: boolean
}

const DashAlertBanner = ({ alerts, defaultOpen = true }: Props) => {
  const nonZero = alerts.filter((a) => a.count > 0)
  const [open, setOpen] = useState(defaultOpen)
  if (nonZero.length === 0) return null

  const total = nonZero.reduce((a, b) => a + b.count, 0)
  const hasDanger = nonZero.some((a) => a.tone !== 'warning')

  const borderColor = hasDanger ? '#ef4444' : '#f59e0b'
  const bg = hasDanger ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        background: bg,
        borderRadius: 10,
        marginTop: 16,
        padding: '12px 16px',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: 0,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <AlertTriangle size={18} color={borderColor} />
        <span>
          {total} alerte{total > 1 ? 's' : ''} à traiter
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open && (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '10px 0 0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 8,
          }}
        >
          {nonZero.map((a) => {
            const color = a.tone === 'warning' ? '#f59e0b' : '#ef4444'
            const inner = (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <span style={{ fontSize: 13 }}>{a.label}</span>
                <strong style={{ color, fontSize: 14 }}>{a.count}</strong>
              </div>
            )
            return (
              <li key={a.label}>
                {a.to ? (
                  <Link to={a.to} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default DashAlertBanner
