import React from 'react'
import { Link } from 'react-router-dom'
import type { ProjectsTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'

const ProjectsTab: React.FC<ProjectsTabProps> = ({ projects }) => {
  const { t } = useI18n()
  return (
    <div className="admin-list">
      {projects.length === 0 ? (
        <div className="admin-empty-state">
          <div className="admin-empty-state-icon">📁</div>
          <p className="admin-empty-state-text">{t('adminAccess.clientDetail.noProject')}</p>
        </div>
      ) : (
        projects.map((project) => (
          <div key={project._id} className="admin-list-item">
            <div className="admin-list-item-content">
              <h3 className="admin-list-item-title">{project.name}</h3>
              <p className="admin-list-item-subtitle">
                {project.status} •{' '}
                {t('adminAccess.clientDetail.progressLine', { percent: project.progressPercent ?? 0 })}
              </p>
            </div>
            <div className="admin-list-item-actions">
              <Link className="portal-button secondary" to={`/admin/projets/${project._id}`}>
                {t('adminAccess.clientDetail.viewProject')}
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default ProjectsTab
