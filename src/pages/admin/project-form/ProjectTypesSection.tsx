import React from 'react'
import type { ProjectTypesSectionProps } from './types'
import {
  SUGGESTIONS_SERVICE_TYPES,
  SUGGESTIONS_DELIVERABLE_TYPES,
} from '../../../lib/formatUtils'

const ProjectTypesSection: React.FC<ProjectTypesSectionProps> = ({
  form,
  setForm,
  serviceTypeInput,
  setServiceTypeInput,
  addServiceType,
  removeServiceType,
  deliverableTypeInput,
  setDeliverableTypeInput,
  addDeliverableType,
  removeDeliverableType,
}) => (
  <div className="project-form-section">
    <div className="project-form-section-header">
      <div className="project-form-section-icon">🎨</div>
      <div>
        <h2 className="project-form-section-title">Types & Modules</h2>
        <p className="project-form-section-subtitle">Prestations et livrables du projet</p>
      </div>
    </div>
    <div className="portal-list">
      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">🛠️</span>
          Types de prestation
        </label>
        <datalist id="service-types-suggestions">
          {SUGGESTIONS_SERVICE_TYPES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="project-form-input-group">
          <input
            className="portal-input"
            list="service-types-suggestions"
            placeholder="Choisir ou saisir (ex: Design, Développement)"
            value={serviceTypeInput}
            onChange={(e) => setServiceTypeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addServiceType())}
            style={{ flex: 1 }}
          />
          <button type="button" className="portal-button secondary" onClick={addServiceType}>
            Ajouter
          </button>
        </div>
        {form.serviceTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {form.serviceTypes.map((s, i) => (
              <span key={i} className="admin-tag">
                {s}
                <button type="button" onClick={() => removeServiceType(i)} aria-label="Retirer">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">📦</span>
          Types de livrables
        </label>
        <datalist id="deliverable-types-suggestions">
          {SUGGESTIONS_DELIVERABLE_TYPES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="project-form-input-group">
          <input
            className="portal-input"
            list="deliverable-types-suggestions"
            placeholder="Choisir ou saisir (ex: Maquettes, Code source)"
            value={deliverableTypeInput}
            onChange={(e) => setDeliverableTypeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDeliverableType())}
            style={{ flex: 1 }}
          />
          <button type="button" className="portal-button secondary" onClick={addDeliverableType}>
            Ajouter
          </button>
        </div>
        {form.deliverableTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {form.deliverableTypes.map((s, i) => (
              <span key={i} className="admin-tag">
                {s}
                <button type="button" onClick={() => removeDeliverableType(i)} aria-label="Retirer">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
)

export default ProjectTypesSection
