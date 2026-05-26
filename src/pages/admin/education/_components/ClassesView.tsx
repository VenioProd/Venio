import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  getClass,
  CLASS_STATUS_LABEL,
  type EducationClass,
} from '@/services/education'

export default function ClassesView({
  classes,
  onCreate,
  onOpen,
  onRefresh,
}: {
  classes: EducationClass[]
  onCreate: () => void
  onOpen: (id: string) => void
  onRefresh: () => void
}) {
  return (
    <div>
      <div className="edu-row between">
        <div>
          <h1 className="edu-h1">Classes</h1>
          <p className="edu-sub">
            {classes.length} classe{classes.length > 1 ? 's' : ''} suivie
            {classes.length > 1 ? 's' : ''}.
          </p>
        </div>
        <div className="edu-row" style={{ gap: 6 }}>
          <button className="edu-btn ghost" onClick={onRefresh}>
            Rafraîchir
          </button>
          <button className="edu-btn" onClick={onCreate}>
            <Plus size={14} /> Nouvelle classe
          </button>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">📚</div>
          <div>Aucune classe pour l'instant.</div>
          <div className="edu-empty-sub">
            Crée ta première classe pour démarrer ton cockpit : étudiants, séances, devoirs et
            notes s'organiseront autour.
          </div>
          <button className="edu-btn" style={{ marginTop: 12 }} onClick={onCreate}>
            <Plus size={13} /> Créer ma première classe
          </button>
        </div>
      ) : (
        <div className="edu-class-grid">
          {classes.map(c => (
            <ClassCard key={c._id} klass={c} onClick={() => onOpen(c._id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClassCard({ klass, onClick }: { klass: EducationClass; onClick: () => void }) {
  const [stats, setStats] = useState<{
    studentCount: number
    sessionCount: number
    openAssignments: number
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    getClass(klass._id)
      .then(r => {
        if (!cancelled) setStats(r.stats)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [klass._id])
  return (
    <div className="edu-class-card" onClick={onClick}>
      <div className="edu-color-strip" style={{ background: klass.color }} />
      <div className="edu-class-card-title">{klass.name}</div>
      <div className="edu-class-card-meta">
        {[klass.school, klass.level, klass.program].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="edu-class-card-stats">
        <div className="edu-class-card-stat">
          <strong>{stats?.studentCount ?? '·'}</strong> étudiants
        </div>
        <div className="edu-class-card-stat">
          <strong>{stats?.sessionCount ?? '·'}</strong> séances
        </div>
        {(stats?.openAssignments ?? 0) > 0 && (
          <div className="edu-class-card-stat">
            <strong>{stats?.openAssignments}</strong> devoirs ouverts
          </div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="edu-pill">{CLASS_STATUS_LABEL[klass.status]}</span>
      </div>
    </div>
  )
}
