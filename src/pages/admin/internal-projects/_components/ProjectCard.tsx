import { PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS, type Project } from './constants'

interface Props {
  project: Project
  isSuperAdmin: boolean
  onOpen: (id: string) => void
  onEdit: (project: Project) => void
  onDelete: (id: string) => void
}

export default function ProjectCard({ project, isSuperAdmin, onOpen, onEdit, onDelete }: Props) {
  const p = project
  const sc = STATUS_COLORS[p.status] || STATUS_COLORS.ARCHIVE
  return (
    <div
      key={p._id}
      className="admin-member-card"
      style={{ cursor: 'pointer' }}
      onClick={() => onOpen(p._id)}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: 'rgba(14, 165, 233, 0.12)',
            border: '1px solid rgba(14, 165, 233, 0.3)',
            color: '#38bdf8',
          }}
        >
          {p.entity}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: sc.bg,
            border: `1px solid ${sc.border}`,
            color: sc.text,
          }}
        >
          {STATUS_LABELS[p.status] || p.status}
        </span>
      </div>
      <h3 className="client-card-name" style={{ marginBottom: 4 }}>
        {p.name}
      </h3>
      {p.description && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 8,
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as any,
          }}
        >
          {p.description}
        </p>
      )}
      {/* Poles */}
      {p.poles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {p.poles.map(pole => (
            <span
              key={pole}
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 12,
                background: 'rgba(139, 92, 246, 0.12)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#c4b5fd',
              }}
            >
              {pole}
            </span>
          ))}
        </div>
      )}
      {/* Members */}
      {p.members.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {p.members.slice(0, 4).map(m => (
            <span
              key={m._id}
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 12,
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.25)',
                color: '#6ee7b7',
              }}
            >
              {m.name.split(' ')[0]}
            </span>
          ))}
          {p.members.length > 4 && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              +{p.members.length - 4}
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <span
          style={{
            fontSize: 11,
            color: PRIORITY_COLORS[p.priority] || 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          ● {p.priority.charAt(0) + p.priority.slice(1).toLowerCase()}
        </span>
        {p.endDate && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            Fin : {new Date(p.endDate).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>
      <div
        className="admin-card-actions"
        style={{ marginTop: 12 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="admin-card-btn admin-card-btn--edit"
          type="button"
          onClick={() => onEdit(p)}
        >
          Modifier
        </button>
        {isSuperAdmin && (
          <button
            className="admin-card-btn admin-card-btn--delete"
            type="button"
            onClick={() => onDelete(p._id)}
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}
