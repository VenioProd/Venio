import { useTheme } from '../context/ThemeContext'
import type { ColorAccent } from '../context/ThemeContext'
import { apiFetch } from '../lib/api'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'

const ACCENTS: { id: ColorAccent; color: string; labelKey: MessageKey }[] = [
  { id: 'sky', color: '#0ea5e9', labelKey: 'shell.accent.sky' },
  { id: 'indigo', color: '#6366f1', labelKey: 'shell.accent.indigo' },
  { id: 'violet', color: '#8b5cf6', labelKey: 'shell.accent.violet' },
  { id: 'fuchsia', color: '#d946ef', labelKey: 'shell.accent.fuchsia' },
  { id: 'rose', color: '#ec4899', labelKey: 'shell.accent.rose' },
  { id: 'coral', color: '#f97316', labelKey: 'shell.accent.coral' },
  { id: 'amber', color: '#f59e0b', labelKey: 'shell.accent.amber' },
  { id: 'yellow', color: '#f9f041', labelKey: 'shell.accent.yellow' },
  { id: 'lime', color: '#84cc16', labelKey: 'shell.accent.lime' },
  { id: 'emerald', color: '#10b981', labelKey: 'shell.accent.emerald' },
  { id: 'teal', color: '#14b8a6', labelKey: 'shell.accent.teal' },
  { id: 'slate', color: '#94a3b8', labelKey: 'shell.accent.slate' },
]

export function ColorThemePicker() {
  const { colorAccent, setColorAccent } = useTheme()
  const { t } = useI18n()

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
        {t('shell.theme.accentTitle')}
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
        {ACCENTS.map(({ id, color, labelKey }) => {
          const isActive = colorAccent === id
          const label = t(labelKey)
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
                boxShadow: isActive ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : 'none',
                opacity: isActive ? 1 : 0.7,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.9'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.7'
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
