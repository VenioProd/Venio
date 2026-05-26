import React from 'react'
import type { ProjectInfoSectionProps } from './types'
import CustomSelect from '@/components/admin/CustomSelect'

const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({ form, setForm, clients }) => (
  <div className="project-form-section">
    <div className="project-form-section-header">
      <div className="project-form-section-icon">📋</div>
      <div>
        <h2 className="project-form-section-title">Informations de base</h2>
        <p className="project-form-section-subtitle">Client, nom et description du projet</p>
      </div>
    </div>
    <div className="portal-list">
      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">👤</span>
          Client
        </label>
        <CustomSelect
          className="portal-input"
          value={form.clientId}
          onChange={(v) => setForm({ ...form, clientId: v })}
          options={[{ value: '', label: 'Sélectionner un client' }, ...clients.map((c) => ({ value: c._id, label: `${c.name} - ${c.email}` }))]}
        />
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">📝</span>
          Nom du projet
        </label>
        <input
          className="portal-input"
          placeholder="Ex: Site web corporate"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">💬</span>
          Résumé
        </label>
        <input
          className="portal-input"
          placeholder="Résumé en une phrase"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </div>

      <div className="project-form-field">
        <label className="project-form-label">
          <span className="project-form-label-icon">📄</span>
          Description détaillée
        </label>
        <textarea
          className="portal-input"
          placeholder="Description complète du projet"
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
            Statut
          </label>
          <CustomSelect
            className="portal-input"
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
            options={[
              { value: 'EN_COURS', label: 'En cours' },
              { value: 'EN_ATTENTE', label: 'En attente' },
              { value: 'TERMINE', label: 'Terminé' },
            ]}
          />
        </div>

        <div className="project-form-field">
          <label className="project-form-label">
            <span className="project-form-label-icon">🔢</span>
            Numéro de projet
          </label>
          <input
            className="portal-input"
            placeholder="Laissé vide = généré auto (ex: PROJ-0001)"
            value={form.projectNumber}
            onChange={(e) => setForm({ ...form, projectNumber: e.target.value })}
          />
        </div>
      </div>
    </div>
  </div>
)

export default ProjectInfoSection
