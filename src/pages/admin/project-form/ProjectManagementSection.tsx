import React from 'react'
import type { ProjectManagementSectionProps } from './types'
import { SUGGESTIONS_TAGS } from '@/lib/formatUtils'
import CustomSelect from '@/components/admin/CustomSelect'

const ProjectManagementSection: React.FC<ProjectManagementSectionProps> = ({
  form,
  setForm,
  admins,
  tagInput,
  setTagInput,
  addTag,
  removeTag,
}) => (
  <div className="project-form-section">
    <div className="project-form-section-header">
      <div className="project-form-section-icon">⚙️</div>
      <div>
        <h2 className="project-form-section-title">Gestion & Organisation</h2>
        <p className="project-form-section-subtitle">Priorité, responsable et suivi</p>
      </div>
    </div>
    <div className="portal-list">
      <div className="project-form-grid">
        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">🎚️</span>
            Priorité
          </label>
          <CustomSelect
            className="portal-input"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v })}
            options={[
              { value: 'BASSE', label: '🟢 Basse' },
              { value: 'NORMALE', label: '🔵 Normale' },
              { value: 'HAUTE', label: '🟡 Haute' },
              { value: 'URGENTE', label: '🔴 Urgente' },
            ]}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">👨‍💼</span>
            Responsable (admin assigne)
          </label>
          <CustomSelect
            className="portal-input"
            value={form.assignedTo}
            onChange={(v) => setForm({ ...form, assignedTo: v })}
            options={[{ value: '', label: 'Non assigne' }, ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` }))]}
          />
        </div>
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">📝</span>
          Notes internes
        </label>
        <textarea
          className="portal-input"
          placeholder="Notes privées, non visibles par le client"
          value={form.internalNotes}
          onChange={(e) => setForm({ ...form, internalNotes: e.target.value })}
          rows={3}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">🏷️</span>
          Tags
        </label>
        <datalist id="tags-suggestions">
          {SUGGESTIONS_TAGS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="project-form-input-group">
          <input
            className="portal-input"
            list="tags-suggestions"
            placeholder="Ex: urgent, refonte (suggestions ou libre)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            style={{ flex: 1 }}
          />
          <button type="button" className="portal-button secondary" onClick={addTag}>
            Ajouter
          </button>
        </div>
        {form.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {form.tags.map((t, i) => (
              <span key={i} className="admin-tag">
                {t}
                <button type="button" onClick={() => removeTag(i)} aria-label="Retirer">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', background: 'transparent', borderRadius: '8px' }}>
        <input
          type="checkbox"
          checked={form.isArchived}
          onChange={(e) => setForm({ ...form, isArchived: e.target.checked })}
          style={{ width: 18, height: 18 }}
        />
        <span style={{ fontSize: '14px', fontWeight: 500 }}>📦 Projet archivé</span>
      </label>
    </div>
  </div>
)

export default ProjectManagementSection
