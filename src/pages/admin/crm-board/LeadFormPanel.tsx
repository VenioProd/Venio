import React from 'react'
import CustomSelect from '@/components/admin/CustomSelect'
import { CRM_SERVICE_TYPES, toDateTimeLocal } from '@/lib/formatUtils'
import type { LeadFormData, AdminUser } from '@/types/crm.types'
import { CRM_STATUSES, CRM_SOURCES, CRM_TEMPERATURES, EMPTY_FORM } from './constants'

interface LeadFormPanelProps {
  form: LeadFormData
  admins: AdminUser[]
  isSuperAdmin: boolean
  canManageCrm: boolean
  onFormChange: (form: LeadFormData) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

const LeadFormPanel: React.FC<LeadFormPanelProps> = ({
  form,
  admins,
  isSuperAdmin,
  canManageCrm,
  onFormChange,
  onSubmit,
}) => {
  return (
    <div className="portal-card" style={{ marginTop: 24 }}>
      <form onSubmit={onSubmit} className="portal-list">
        <div className="admin-form-section" style={{ marginBottom: 0 }}>
          <h2>Nouveau lead</h2>
          <div className="crm-form-grid">
            <input
              className="portal-input"
              placeholder="Entreprise *"
              value={form.company}
              onChange={(e) => onFormChange({ ...form, company: e.target.value })}
              required
            />
            <input
              className="portal-input"
              placeholder="Contact (nom)"
              value={form.contactName}
              onChange={(e) => onFormChange({ ...form, contactName: e.target.value })}
            />
            <input
              className="portal-input"
              placeholder="Email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => onFormChange({ ...form, contactEmail: e.target.value })}
            />
            <input
              className="portal-input"
              placeholder="Téléphone"
              value={form.contactPhone}
              onChange={(e) => onFormChange({ ...form, contactPhone: e.target.value })}
            />
            <CustomSelect
              className="portal-input"
              value={form.source}
              onChange={(v) => onFormChange({ ...form, source: v })}
              options={[{ value: '', label: 'Source' }, ...CRM_SOURCES.map((s) => ({ value: s, label: s }))]}
            />
            <input
              className="portal-input"
              placeholder="Budget estimé"
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => onFormChange({ ...form, budget: e.target.value })}
            />
            <CustomSelect
              className="portal-input"
              value={form.priority}
              onChange={(v) => onFormChange({ ...form, priority: v })}
              options={[
                { value: 'BASSE', label: 'Priorité basse' },
                { value: 'NORMALE', label: 'Priorité normale' },
                { value: 'HAUTE', label: 'Priorité haute' },
                { value: 'URGENTE', label: 'Priorité urgente' },
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={form.status}
              onChange={(v) => onFormChange({ ...form, status: v })}
              options={CRM_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
            />
            {isSuperAdmin && (
              <CustomSelect
                className="portal-input"
                value={form.assignedTo}
                onChange={(v) => onFormChange({ ...form, assignedTo: v })}
                options={[{ value: '', label: 'Commercial (optionnel)' }, ...admins.map((a) => ({ value: a._id, label: a.name }))]}
              />
            )}
            <input
              className="portal-input"
              type="datetime-local"
              value={form.nextActionAt ? toDateTimeLocal(form.nextActionAt) : ''}
              onChange={(e) => onFormChange({ ...form, nextActionAt: e.target.value })}
            />
            <CustomSelect
              className="portal-input"
              value={form.serviceType}
              onChange={(v) => onFormChange({ ...form, serviceType: v })}
              options={[{ value: '', label: 'Type de service' }, ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: s }))]}
            />
            <CustomSelect
              className="portal-input"
              value={form.leadTemperature}
              onChange={(v) => onFormChange({ ...form, leadTemperature: v })}
              options={CRM_TEMPERATURES.map((t) => ({ value: t.key, label: t.label }))}
            />
            <input
              className="portal-input"
              placeholder="Notes internes"
              value={form.notes}
              onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <textarea
              className="portal-input"
              placeholder="Notes détaillées des interactions (appels, emails, réunions...)"
              value={form.interactionNotes}
              onChange={(e) => onFormChange({ ...form, interactionNotes: e.target.value })}
              rows={6}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div className="crm-inline-actions" style={{ marginTop: 12 }}>
            <button className="portal-button" type="submit" disabled={!canManageCrm}>
              Créer le lead
            </button>
            <button
              className="portal-button secondary"
              type="button"
              onClick={() => onFormChange({ ...EMPTY_FORM })}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default LeadFormPanel
