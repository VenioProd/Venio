import type { CSSProperties } from 'react'
import type { Project } from './types'

const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
  ARCHIVE: 'Archivé',
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  EN_COURS: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#6ee7b7' },
  EN_ATTENTE: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)', text: '#fde047' },
  TERMINE: { bg: 'rgba(100, 116, 180, 0.12)', border: 'rgba(100, 116, 180, 0.35)', text: '#a5b4cf' },
  ARCHIVE: { bg: 'rgba(100, 100, 100, 0.12)', border: 'rgba(100, 100, 100, 0.35)', text: '#9ca3af' },
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#6ee7b7',
  NORMALE: '#a5b4cf',
  HAUTE: '#fbbf24',
  URGENTE: '#f87171',
}

interface Props {
  loading: boolean
  projects: Project[]
  isSuperAdmin: boolean
  onOpenProject: (projectId: string) => void
  onEdit: (project: Project) => void
  onDelete: (projectId: string) => void
}

export default function ProjectsTab({ loading, projects, isSuperAdmin, onOpenProject, onEdit, onDelete }: Props) {
  return (
    <div style={{ marginTop: 20 }}>
      {loading ? (
        <div className="portal-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="portal-card">
          <div className="admin-empty-state">
            <div className="admin-empty-state-icon">🏗️</div>
            <p className="admin-empty-state-text">Aucun projet interne</p>
          </div>
        </div>
      ) : (
        <div className="admin-cards-grid">
          {projects.map((project) => {
            const statusColor = STATUS_COLORS[project.status] || STATUS_COLORS.ARCHIVE
            return (
              <div
                key={project._id}
                className="admin-member-card"
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenProject(project._id)}
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
                      color: 'var(--primary)',
                    }}
                  >
                    {project.entity}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: statusColor.bg,
                      border: `1px solid ${statusColor.border}`,
                      color: statusColor.text,
                    }}
                  >
                    {STATUS_LABELS[project.status] || project.status}
                  </span>
                </div>
                <h3 className="client-card-name" style={{ marginBottom: 4 }}>
                  {project.name}
                </h3>
                {project.description && (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginBottom: 8,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical' as CSSProperties['WebkitBoxOrient'],
                    }}
                  >
                    {project.description}
                  </p>
                )}
                {project.poles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {project.poles.map((pole) => (
                      <span
                        key={pole}
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 12,
                          background: 'rgba(14, 165, 233, 0.12)',
                          border: '1px solid rgba(14, 165, 233, 0.3)',
                          color: 'var(--primary)',
                        }}
                      >
                        {pole}
                      </span>
                    ))}
                  </div>
                )}
                {project.members.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {project.members.slice(0, 4).map((member) => (
                      <span
                        key={member._id}
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 12,
                          background: 'rgba(16,185,129,0.1)',
                          border: '1px solid rgba(16,185,129,0.25)',
                          color: '#6ee7b7',
                        }}
                      >
                        {member.name.split(' ')[0]}
                      </span>
                    ))}
                    {project.members.length > 4 && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        +{project.members.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: PRIORITY_COLORS[project.priority] || 'var(--text-secondary)',
                      fontWeight: 600,
                    }}
                  >
                    ● {project.priority.charAt(0) + project.priority.slice(1).toLowerCase()}
                  </span>
                  {project.endDate && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      Fin : {new Date(project.endDate).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
                <div
                  className="admin-card-actions"
                  style={{ marginTop: 12 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button className="admin-card-btn admin-card-btn--edit" type="button" onClick={() => onEdit(project)}>
                    Modifier
                  </button>
                  {isSuperAdmin && (
                    <button
                      className="admin-card-btn admin-card-btn--delete"
                      type="button"
                      onClick={() => onDelete(project._id)}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
