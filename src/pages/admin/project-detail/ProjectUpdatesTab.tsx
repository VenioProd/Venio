import React from 'react'
import type { ProjectUpdatesTabProps } from './types'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'

const ProjectUpdatesTab: React.FC<ProjectUpdatesTabProps> = ({
  updates,
  updateForm,
  setUpdateForm,
  canEditProjects,
  onAddUpdate,
}) => {
  const { t } = useI18n()
  return (
    <div style={{ marginTop: 24 }}>
      <div className="admin-form-section">
        <h2>{t('projects.updates.addHeading')}</h2>
        {canEditProjects ? (
          <form className="portal-list" onSubmit={onAddUpdate}>
            <input
              className="portal-input"
              placeholder={t('projects.updates.titlePlaceholder')}
              value={updateForm.title}
              onChange={(event) => setUpdateForm({ ...updateForm, title: event.target.value })}
              required
            />
            <textarea
              className="portal-input"
              placeholder={t('projects.updates.descriptionPlaceholder')}
              value={updateForm.description}
              onChange={(event) => setUpdateForm({ ...updateForm, description: event.target.value })}
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button className="portal-button" type="submit">
              {t('projects.updates.submit')}
            </button>
          </form>
        ) : (
          <div className="admin-info">{t('projects.updates.readOnly')}</div>
        )}
      </div>

      <div className="admin-form-section" style={{ marginTop: 24 }}>
        <h2>{t('projects.updates.history')}</h2>
        <div className="portal-list">
          {updates.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: '24px' }}>
              <p className="admin-empty-state-text">{t('projects.updates.empty')}</p>
            </div>
          ) : (
            updates.map((update) => (
              <div key={update._id} className="admin-update-item">
                <strong>{update.title}</strong>
                <p>{update.description}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {formatDate(update.createdAt, {
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
