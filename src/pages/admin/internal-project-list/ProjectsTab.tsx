import type { CSSProperties } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { POLE_KEYS, PRIORITY_KEYS, PROJECT_FILTER_STATUS_KEYS, labelFor } from './labels'
import type { Project } from './types'

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  EN_COURS: { bg: 'var(--accent-soft)', border: 'var(--accent-border)', text: 'var(--primary)' },
  EN_ATTENTE: {
    bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 40%, transparent)',
    text: 'var(--warning)',
  },
  TERMINE: {
    bg: 'var(--good-surface)',
    border: 'color-mix(in srgb, var(--good) 28%, transparent)',
    text: 'var(--good)',
  },
  ARCHIVE: {
    bg: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--text-secondary) 35%, transparent)',
    text: 'var(--text-secondary)',
  },
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: 'var(--good)',
  NORMALE: 'var(--text-secondary)',
  HAUTE: 'var(--warning)',
  URGENTE: 'var(--critical)',
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
  const { t } = useI18n()
  return (
    <div style={{ marginTop: 20 }}>
      {loading ? (
        <div className="portal-card">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t('common.loading')}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="portal-card">
          <div className="admin-empty-state">
            <div className="admin-empty-state-icon">🏗️</div>
            <p className="admin-empty-state-text">{t('projA.projects.empty')}</p>
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
                      borderRadius: 'var(--r-sm)',
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
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
                      borderRadius: 'var(--r-sm)',
                      background: statusColor.bg,
                      border: `1px solid ${statusColor.border}`,
                      color: statusColor.text,
                    }}
                  >
                    {labelFor(t, PROJECT_FILTER_STATUS_KEYS, project.status)}
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
                          borderRadius: 'var(--r-md)',
                          background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                          color: 'var(--primary)',
                        }}
                      >
                        {labelFor(t, POLE_KEYS, pole)}
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
                          borderRadius: 'var(--r-md)',
                          background: 'color-mix(in srgb, var(--good) 10%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--good) 25%, transparent)',
                          color: 'var(--good)',
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
                    ● {labelFor(t, PRIORITY_KEYS, project.priority)}
                  </span>
                  {project.endDate && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      {t('projA.projects.endDate', { date: formatDate(project.endDate) })}
                    </span>
                  )}
                </div>
                <div
                  className="admin-card-actions"
                  style={{ marginTop: 12 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button className="admin-card-btn admin-card-btn--edit" type="button" onClick={() => onEdit(project)}>
                    {t('common.edit')}
                  </button>
                  {isSuperAdmin && (
                    <button
                      className="admin-card-btn admin-card-btn--delete"
                      type="button"
                      onClick={() => onDelete(project._id)}
                    >
                      {t('common.delete')}
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
