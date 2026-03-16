import React from 'react'
import { Link } from 'react-router-dom'
import type { ProjectsTabProps } from './types'

const ProjectsTab: React.FC<ProjectsTabProps> = ({ projects }) => (
  <div className="admin-list">
    {projects.length === 0 ? (
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon">📁</div>
        <p className="admin-empty-state-text">Aucun projet pour ce client</p>
      </div>
    ) : (
      projects.map((project) => (
        <div key={project._id} className="admin-list-item">
          <div className="admin-list-item-content">
            <h3 className="admin-list-item-title">{project.name}</h3>
            <p className="admin-list-item-subtitle">{project.status} • Progression {project.progressPercent ?? 0}%</p>
          </div>
          <div className="admin-list-item-actions">
            <Link className="portal-button secondary" to={`/admin/projets/${project._id}`}>
              Voir projet
            </Link>
          </div>
        </div>
      ))
    )}
  </div>
)

export default ProjectsTab
