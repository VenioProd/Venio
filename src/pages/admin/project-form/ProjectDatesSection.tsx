import React from 'react'
import type { ProjectDatesSectionProps } from './types'
import { toDateTimeLocal } from '../../../lib/formatUtils'

const ProjectDatesSection: React.FC<ProjectDatesSectionProps> = ({ form, setForm }) => {
  const addDeadline = () => {
    setForm({
      ...form,
      deadlines: [...form.deadlines, { label: '', dueAt: '' }],
    })
  }

  const updateDeadline = (index: number, field: string, value: string) => {
    const next = [...form.deadlines]
    next[index] = { ...next[index], [field]: value }
    setForm({ ...form, deadlines: next })
  }

  const deadlineDueAtDisplay = (dueAt: string): string => (dueAt ? toDateTimeLocal(dueAt) : '')

  const removeDeadline = (index: number) => {
    setForm({ ...form, deadlines: form.deadlines.filter((_, i) => i !== index) })
  }

  return (
    <div className="project-form-section">
      <div className="project-form-section-header">
        <div className="project-form-section-icon">📅</div>
        <div>
          <h2 className="project-form-section-title">Planning & Dates</h2>
          <p className="project-form-section-subtitle">Dates clés et jalons du projet</p>
        </div>
      </div>
      <div className="portal-list">
        <div className="project-form-grid">
          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">🚀</span>
              Date de début
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>

          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">🎯</span>
              Fin prévue
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>

          <div className="project-form-field">
            <label className="project-form-label">
              <span className="project-form-label-icon">✅</span>
              Livraison réelle
            </label>
            <input
              className="portal-input"
              type="date"
              value={form.deliveredAt}
              onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })}
            />
          </div>
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">⏰</span>
            Deadlines & Jalons
          </label>
          {form.deadlines.map((d, i) => (
            <div key={i} className="deadline-row">
              <input
                className="portal-input"
                placeholder="Libellé du jalon"
                value={d.label}
                onChange={(e) => updateDeadline(i, 'label', e.target.value)}
                style={{ flex: 1, margin: 0 }}
              />
              <input
                className="portal-input"
                type="datetime-local"
                value={deadlineDueAtDisplay(d.dueAt)}
                onChange={(e) => updateDeadline(i, 'dueAt', e.target.value || '')}
                style={{ width: 200, margin: 0 }}
              />
              <button
                type="button"
                className="portal-button secondary"
                onClick={() => removeDeadline(i)}
                style={{ padding: '10px 14px' }}
              >
                🗑️
              </button>
            </div>
          ))}
          <button
            type="button"
            className="portal-button secondary"
            onClick={addDeadline}
            style={{ marginTop: 8 }}
          >
            + Ajouter un jalon
          </button>
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">🔔</span>
            Date de rappel
          </label>
          <input
            className="portal-input"
            type="datetime-local"
            value={toDateTimeLocal(form.reminderAt)}
            onChange={(e) => setForm({ ...form, reminderAt: e.target.value || '' })}
            style={{ maxWidth: 260 }}
          />
        </div>
      </div>
    </div>
  )
}

export default ProjectDatesSection
