import React from 'react'
import type { ProjectUpdatesTabProps } from './types'

const ProjectUpdatesTab: React.FC<ProjectUpdatesTabProps> = ({
  updates,
  updateForm,
  setUpdateForm,
  canEditProjects,
  onAddUpdate,
}) => {
  return (
        <div style={{ marginTop: 24 }}>
          <div className="admin-form-section">
            <h2>Ajouter une mise à jour</h2>
            {canEditProjects ? (
              <form className="portal-list" onSubmit={onAddUpdate}>
                <input
                  className="portal-input"
                  placeholder="Titre de la mise à jour"
                  value={updateForm.title}
                  onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })}
                  required
                />
                <textarea
                  className="portal-input"
                  placeholder="Description"
                  value={updateForm.description}
                  onChange={(event) => setUpdateForm({ ...updateForm, description: event.target.value })}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
                <button className="portal-button" type="submit">
                  + Ajouter une mise à jour
                </button>
              </form>
            ) : (
              <div className="admin-info">Accès lecture seule aux mises à jour.</div>
            )}
          </div>

          <div className="admin-form-section" style={{ marginTop: 24 }}>
            <h2>Historique des mises à jour</h2>
            <div className="portal-list">
              {updates.length === 0 ? (
                <div className="admin-empty-state" style={{ padding: '24px' }}>
                  <p className="admin-empty-state-text">Aucune mise à jour</p>
                </div>
              ) : (
                updates.map((update) => (
                  <div key={update._id} className="admin-update-item">
                    <strong>{update.title}</strong>
                    <p>{update.description}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      {new Date(update.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
  )
}

export default ProjectUpdatesTab
