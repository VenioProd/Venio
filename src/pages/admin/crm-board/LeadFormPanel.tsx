import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import { CRM_SERVICE_TYPES, toDateTimeLocal } from '../../../lib/formatUtils'
import type { LeadFormData, AdminUser } from '../../../types/crm.types'
import DuplicatesBanner from './DuplicatesBanner'
import {
  CRM_STATUSES,
  CRM_SOURCES,
  CRM_PROJECTS,
  CRM_ENTITIES,
  CRM_TEMPERATURES,
  EMPTY_FORM,
  SERVICE_TYPE_LABEL_KEYS,
  SOURCE_LABEL_KEYS,
  labelOfValue,
} from './constants'

interface LeadFormPanelProps {
  form: LeadFormData
  admins: AdminUser[]
  isSuperAdmin: boolean
  canManageCrm: boolean
  onFormChange: (form: LeadFormData) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  /** Ferme le panneau. Sur mobile il occupe l'écran : c'est son seul moyen de sortie. */
  onClose?: () => void
}

const LeadFormPanel: React.FC<LeadFormPanelProps> = ({
  form,
  admins,
  isSuperAdmin,
  canManageCrm,
  onFormChange,
  onSubmit,
  onClose,
}) => {
  const { t } = useI18n()
  return (
    <div className="portal-card crm-form-panel">
      <form onSubmit={onSubmit} className="portal-list">
        <div className="admin-form-section" style={{ marginBottom: 0 }}>
          <div className="crm-form-panel-header">
            <h2>{t('crm.form.title')}</h2>
            {onClose && (
              <button
                type="button"
                className="crm-form-panel-close"
                onClick={onClose}
                aria-label={t('crm.form.closeLabel')}
              >
                &times;
              </button>
            )}
          </div>
          <div className="crm-form-grid">
            <input
              className="portal-input"
              placeholder={t('crm.form.company')}
              value={form.company}
              onChange={(e) => onFormChange({ ...form, company: e.target.value })}
              required
            />
            <input
              className="portal-input"
              placeholder={t('crm.form.contactName')}
              value={form.contactName}
              onChange={(e) => onFormChange({ ...form, contactName: e.target.value })}
            />
            <input
              className="portal-input"
              placeholder={t('crm.form.email')}
              type="email"
              value={form.contactEmail}
              onChange={(e) => onFormChange({ ...form, contactEmail: e.target.value })}
            />
            <input
              className="portal-input"
              placeholder={t('crm.form.phone')}
              value={form.contactPhone}
              onChange={(e) => onFormChange({ ...form, contactPhone: e.target.value })}
            />
            <CustomSelect
              className="portal-input"
              value={form.source}
              onChange={(v) => onFormChange({ ...form, source: v })}
              options={[
                { value: '', label: t('crm.form.source') },
                ...CRM_SOURCES.map((s) => ({ value: s, label: labelOfValue(t, SOURCE_LABEL_KEYS, s) })),
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={form.project}
              onChange={(v) => onFormChange({ ...form, project: v })}
              options={[
                { value: '', label: t('crm.form.project') },
                ...CRM_PROJECTS.map((p) => ({ value: p.key, label: t(p.labelKey) })),
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={form.entity}
              onChange={(v) => onFormChange({ ...form, entity: v })}
              options={[
                { value: '', label: t('crm.form.entity') },
                ...CRM_ENTITIES.map((e) => ({ value: e.key, label: t(e.labelKey) })),
              ]}
            />
            <input
              className="portal-input"
              placeholder={t('crm.form.budget')}
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
                { value: 'BASSE', label: t('crm.form.priorityLow') },
                { value: 'NORMALE', label: t('crm.form.priorityNormal') },
                { value: 'HAUTE', label: t('crm.form.priorityHigh') },
                { value: 'URGENTE', label: t('crm.form.priorityUrgent') },
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={form.status}
              onChange={(v) => onFormChange({ ...form, status: v })}
              options={CRM_STATUSES.map((s) => ({ value: s.key, label: t(s.labelKey) }))}
            />
            {isSuperAdmin && (
              <CustomSelect
                className="portal-input"
                value={form.assignedTo}
                onChange={(v) => onFormChange({ ...form, assignedTo: v })}
                options={[
                  { value: '', label: t('crm.form.salesOptional') },
                  ...admins.map((a) => ({ value: a._id, label: a.name })),
                ]}
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
              options={[
                { value: '', label: t('crm.form.serviceType') },
                ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: labelOfValue(t, SERVICE_TYPE_LABEL_KEYS, s) })),
              ]}
            />
            <CustomSelect
              className="portal-input"
              value={form.leadTemperature}
              onChange={(v) => onFormChange({ ...form, leadTemperature: v })}
              options={CRM_TEMPERATURES.map((tp) => ({ value: tp.key, label: t(tp.labelKey) }))}
            />
            <input
              className="portal-input"
              placeholder={t('crm.form.internalNotes')}
              value={form.notes}
              onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
            />
          </div>
          <DuplicatesBanner company={form.company} contactEmail={form.contactEmail} contactPhone={form.contactPhone} />
          <div style={{ marginTop: 12 }}>
            <textarea
              className="portal-input"
              placeholder={t('crm.form.interactionNotes')}
              value={form.interactionNotes}
              onChange={(e) => onFormChange({ ...form, interactionNotes: e.target.value })}
              rows={6}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div className="crm-inline-actions crm-form-panel-actions" style={{ marginTop: 12 }}>
            <button className="portal-button" type="submit" disabled={!canManageCrm}>
              {t('crm.form.create')}
            </button>
            <button className="portal-button secondary" type="button" onClick={() => onFormChange({ ...EMPTY_FORM })}>
              {t('crm.form.reset')}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default LeadFormPanel
