import { useTheme } from '../context/ThemeContext'
import type { ColorAccent } from '../context/ThemeContext'
import { apiFetch } from '../lib/api'

const ACCENTS: { id: ColorAccent; color: string }[] = [
  { id: 'sky',     color: '#0ea5e9' },
  { id: 'violet',  color: '#8b5cf6' },
  { id: 'emerald', color: '#10b981' },
  { id: 'amber',   color: '#f59e0b' },
  { id: 'rose',    color: '#ec4899' },
  { id: 'coral',   color: '#f97316' },
  { id: 'yellow',  color: '#f9f041' },
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
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {ACCENTS.map(({ id, color }) => {
          const isActive = colorAccent === id
          return (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              title={id}
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
