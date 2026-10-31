import React from 'react'
import type { ProjectInfoSectionProps } from './types'
import { useI18n } from '../../../context/I18nContext'
import CustomSelect from '../../../components/admin/CustomSelect'

const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({ form, setForm, clients }) => {
  const { t } = useI18n()
  return (
    <div className="project-form-section">
      <div className="project-form-section-header">
        <div className="project-form-section-icon">📋</div>
        <div>
          <h2 className="project-form-section-title">{t('projects.form.info.title')}</h2>
          <p className="project-form-section-subtitle">{t('projects.form.info.subtitle')}</p>
        </div>
      </div>
      <div className="portal-list">
        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">👤</span>
            {t('projects.form.info.client')}
          </label>
          <CustomSelect
            className="portal-input"
            value={form.clientId}
            onChange={(v) => setForm({ ...form, clientId: v })}
            options={[
              { value: '', label: t('projects.form.info.selectClient') },
              ...clients.map((c) => ({ value: c._id, label: `${c.name} - ${c.email}` })),
            ]}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">📝</span>
            {t('projects.form.info.name')}
          </label>
          <input
            className="portal-input"
            placeholder={t('projects.form.info.namePlaceholder')}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">💬</span>
            {t('projects.form.info.summary')}
          </label>
          <input
            className="portal-input"
            placeholder={t('projects.form.info.summaryPlaceholder')}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">📄</span>
            {t('projects.form.info.description')}
          </label>
          <textarea
            className="portal-input"
            placeholder={t('projects.form.info.descriptionPlaceholder')}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="project-form-grid">
          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">📊</span>
              {t('projects.form.info.status')}
            </label>
            <CustomSelect
              className="portal-input"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[
                { value: 'EN_COURS', label: t('projects.status.inProgress') },
                { value: 'EN_ATTENTE', label: t('projects.status.onHold') },
                { value: 'TERMINE', label: t('projects.status.done') },
              ]}
            />
          </div>

          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">🔢</span>
              {t('projects.form.info.number')}
            </label>
            <input
              className="portal-input"
              placeholder={t('projects.form.info.numberPlaceholder')}
              value={form.projectNumber}
              onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectInfoSection
