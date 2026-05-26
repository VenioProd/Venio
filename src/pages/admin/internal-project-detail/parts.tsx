/**
 * Petits composants UI extraits de InternalProjectDetail pour rester < 800 lignes.
 * Logique métier reste dans le composant parent ; ces parts ne font que du JSX.
 */
import type { Project, Mission } from './types'

export function LoadingState() {
  return (
    <div className="portal-container">
      <div className="portal-card">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
      </div>
    </div>
  )
}

export function NotFoundState() {
  return (
    <div className="portal-container">
      <div className="portal-card">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Projet introuvable.</p>
      </div>
    </div>
  )
}

interface StatusSelectorProps {
  current: string
  saving: boolean
  statusLabels: Record<string, string>
  statusColors: Record<string, { bg: string; border: string; text: string }>
  onChange: (status: string) => void
}

export function StatusSelector({ current, saving, statusLabels, statusColors, onChange }: StatusSelectorProps) {
  return (
    <div style={{ marginTop: 20 }}>
      <label className="portal-label">Changer le statut</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {Object.entries(statusLabels).map(([v, l]) => {
          const c = statusColors[v]
          return (
            <button
              key={v}
              type="button"
              disabled={saving || current === v}
              onClick={() => onChange(v)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: '1px solid',
                fontSize: 12,
                fontWeight: 600,
                cursor: current === v ? 'default' : 'pointer',
                background: current === v ? c.bg : 'transparent',
                borderColor: current === v ? c.border : 'var(--border)',
                color: current === v ? c.text : 'var(--text-secondary)',
                opacity: saving ? 0.6 : 1,
                transition: 'all .15s',
              }}
            >
              {l}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface OverviewTabProps {
  project: Project
  missions: Mission[]
  onGoToMissions: () => void
}

export function MetaInfo({ project }: { project: Project }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
      {project.startDate && (
        <div className="portal-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Début
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.startDate).toLocaleDateString('fr-FR')}</div>
        </div>
      )}
      {project.endDate && (
        <div className="portal-card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Fin prévue
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.endDate).toLocaleDateString('fr-FR')}</div>
        </div>
      )}
      <div className="portal-card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Créé par
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{project.createdBy?.name || '—'}</div>
      </div>
      <div className="portal-card" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Mise à jour
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(project.updatedAt).toLocaleDateString('fr-FR')}</div>
      </div>
    </div>
  )
}

export function OverviewTab({ project, missions, onGoToMissions }: OverviewTabProps) {
  return (
    <>
      {project.poles.length > 0 && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>Pôles</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {project.poles.map((pole) => (
              <span
                key={pole}
                style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd' }}
              >
                {pole}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="portal-card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
          Membres ({project.members.length})
        </h2>
        {project.members.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aucun membre assigné directement (accessible via pôle)</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {project.members.map((m) => (
              <div
                key={m._id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
              >
                <div
                  style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,150,105,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6ee7b7' }}
                >
                  {(m.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {project.tags.length > 0 && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Tags</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {project.tags.map((tag) => (
              <span
                key={tag}
                style={{ fontSize: 11, padding: '3px 9px', borderRadius: 12, background: 'rgba(100,116,180,0.12)', border: '1px solid rgba(100,116,180,0.25)', color: '#a5b4cf' }}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
      {missions.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            type="button"
            onClick={onGoToMissions}
            style={{ fontSize: 12, color: 'rgba(253,224,71,0.7)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Voir les {missions.length} mission{missions.length > 1 ? 's' : ''} de ce projet →
          </button>
        </div>
      )}
    </>
  )
}
