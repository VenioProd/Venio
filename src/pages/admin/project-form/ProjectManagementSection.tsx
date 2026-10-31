import React from 'react'
import type { ProjectManagementSectionProps } from './types'
import { SUGGESTIONS_TAGS } from '../../../lib/formatUtils'
import { useI18n } from '../../../context/I18nContext'
import CustomSelect from '../../../components/admin/CustomSelect'

const ProjectManagementSection: React.FC<ProjectManagementSectionProps> = ({
  form,
  setForm,
  admins,
  tagInput,
  setTagInput,
  addTag,
  removeTag,
}) => {
  const { t } = useI18n()
  return (
    <div className="project-form-section">
      <div className="project-form-section-header">
        <div className="project-form-section-icon">⚙️</div>
        <div>
          <h2 className="project-form-section-title">{t('projects.form.mgmt.title')}</h2>
          <p className="project-form-section-subtitle">{t('projects.form.mgmt.subtitle')}</p>
        </div>
      </div>
      <div className="portal-list">
        <div className="project-form-grid">
          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">🎚️</span>
              {t('projects.form.mgmt.priority')}
            </label>
            <CustomSelect
              className="portal-input"
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={[
                { value: 'BASSE', label: t('projects.form.mgmt.priorityLow') },
                { value: 'NORMALE', label: t('projects.form.mgmt.priorityNormal') },
                { value: 'HAUTE', label: t('projects.form.mgmt.priorityHigh') },
                { value: 'URGENTE', label: t('projects.form.mgmt.priorityUrgent') },
              ]}
            />
          </div>

          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">👨‍💼</span>
              {t('projects.form.mgmt.owner')}
            </label>
            <CustomSelect
              className="portal-input"
              value={form.assignedTo}
              onChange={(v) => setForm({ ...form, assignedTo: v })}
              options={[
                { value: '', label: t('projects.form.mgmt.unassigned') },
                ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` })),
              ]}
            />
          </div>
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">📝</span>
            {t('projects.form.mgmt.internalNotes')}
          </label>
          <textarea
            className="portal-input"
            placeholder={t('projects.form.mgmt.internalNotesPlaceholder')}
            value={form.internalNotes}
            onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">🏷️</span>
            {t('projects.form.mgmt.tags')}
          </label>
          <datalist id="tags-suggestions">
            {SUGGESTIONS_TAGS.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
          <div className="project-form-input-group">
            <input
              className="portal-input"
              list="tags-suggestions"
              placeholder={t('projects.form.mgmt.tagPlaceholder')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              style={{ flex: 1 }}
            />
            <button type="button" className="portal-button secondary" onClick={addTag}>
              {t('projects.form.add')}
            </button>
          </div>
          {form.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {form.tags.map((tag, i) => (
                <span key={i} className="admin-tag">
                  {tag}
                  <button type="button" onClick={() => removeTag(i)} aria-label={t('projects.form.remove')}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '12px',
            background: 'transparent',
            borderRadius: '8px',
          }}
        >
          <input
            type="checkbox"
            checked={form.isArchived}
            onChange={(e) => setForm({ ...form, isArchived: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>{t('projects.form.mgmt.archived')}</span>
        </label>
      </div>
    </div>
  )
}

export default ProjectManagementSection
