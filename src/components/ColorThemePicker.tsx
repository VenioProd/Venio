import { useTheme } from '../context/ThemeContext'
import type { ColorAccent } from '../context/ThemeContext'
import { apiFetch } from '../lib/api'

const ACCENTS: { id: ColorAccent; color: string; label: string }[] = [
  { id: 'sky',     color: '#0ea5e9', label: 'Bleu Venio' },
  { id: 'indigo',  color: '#6366f1', label: 'Indigo' },
  { id: 'violet',  color: '#8b5cf6', label: 'Violet' },
  { id: 'fuchsia', color: '#d946ef', label: 'Fuchsia' },
  { id: 'rose',    color: '#ec4899', label: 'Rose' },
  { id: 'coral',   color: '#f97316', label: 'Corail' },
  { id: 'amber',   color: '#f59e0b', label: 'Ambre' },
  { id: 'yellow',  color: '#f9f041', label: 'Jaune' },
  { id: 'lime',    color: '#84cc16', label: 'Lime' },
  { id: 'emerald', color: '#10b981', label: 'Émeraude' },
  { id: 'teal',    color: '#14b8a6', label: 'Teal' },
  { id: 'slate',   color: '#94a3b8', label: 'Graphite' },
]

export function ColorThemePicker() {
  const { colorAccent, setColorAccent } = useTheme()

  const handleSelect = (accent: ColorAccent) => {
    setColorAccent(accent)
    apiFetch('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ colorTheme: accent }),
    }).catch(() => {
      // silent fail
    })
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Couleur d&apos;accent
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))',
          gap: '10px',
          alignItems: 'center',
          maxWidth: '320px',
        }}
      >
        {ACCENTS.map(({ id, color, label }) => {
          const isActive = colorAccent === id
          return (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              title={label}
              aria-label={label}
              aria-pressed={isActive}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: color,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.15s, box-shadow 0.15s',
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                boxShadow: isActive
                  ? `0 0 0 2px #fff, 0 0 0 4px ${color}`
                  : 'none',
                opacity: isActive ? 1 : 0.7,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
