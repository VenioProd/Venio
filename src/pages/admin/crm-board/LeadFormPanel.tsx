import React from 'react'
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
  crmEntities?: string[]
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
  crmEntities,
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
            <h2 id="crm-create-title">{t('crm.form.title')}</h2>
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
          <fieldset className="crm-form-group">
            <legend>{t('crm.form.group.company')}</legend>
            <div className="crm-form-grid">
              <label className="crm-form-field">
                <span>{t('crm.form.company')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.company')}
                  value={form.company}
                  onChange={(e) => onFormChange({ ...form, company: e.target.value })}
                  required
                />
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.project')}</span>
                <select
                  className="portal-input"
                  value={form.project}
                  onChange={(e) => onFormChange({ ...form, project: e.target.value })}
                >
                  {[
                    { value: '', label: t('crm.form.project') },
                    ...CRM_PROJECTS.map((p) => ({ value: p.key, label: t(p.labelKey) })),
                  ].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.entity')}</span>
                <select
                  className="portal-input"
                  value={form.entity}
                  onChange={(e) => onFormChange({ ...form, entity: e.target.value })}
                >
                  {[
                    { value: '', label: t('crm.form.entity') },
                    ...CRM_ENTITIES.filter((entity) => !crmEntities?.length || crmEntities.includes(entity.key)).map(
                      (e) => ({ value: e.key, label: t(e.labelKey) }),
                    ),
                  ].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset className="crm-form-group">
            <legend>{t('crm.form.group.contact')}</legend>
            <div className="crm-form-grid">
              <label className="crm-form-field">
                <span>{t('crm.form.contactName')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.contactName')}
                  value={form.contactName}
                  onChange={(e) => onFormChange({ ...form, contactName: e.target.value })}
                />
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.email')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.email')}
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => onFormChange({ ...form, contactEmail: e.target.value })}
                />
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.phone')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.phone')}
                  value={form.contactPhone}
                  onChange={(e) => onFormChange({ ...form, contactPhone: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="crm-form-group">
            <legend>{t('crm.form.group.qualification')}</legend>
            <div className="crm-form-grid">
              <label className="crm-form-field">
                <span>{t('crm.form.source')}</span>
                <select
                  className="portal-input"
                  value={form.source}
                  onChange={(e) => onFormChange({ ...form, source: e.target.value })}
                >
                  {[
                    { value: '', label: t('crm.form.source') },
                    ...CRM_SOURCES.map((s) => ({ value: s, label: labelOfValue(t, SOURCE_LABEL_KEYS, s) })),
                  ].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.budget')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.budget')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budget}
                  onChange={(e) => onFormChange({ ...form, budget: e.target.value })}
                />
              </label>
              <label className="crm-form-field">
                <span>{t('crm.export.priority')}</span>
                <select
                  className="portal-input"
                  value={form.priority}
                  onChange={(e) => onFormChange({ ...form, priority: e.target.value })}
                >
                  {[
                    { value: 'BASSE', label: t('crm.form.priorityLow') },
                    { value: 'NORMALE', label: t('crm.form.priorityNormal') },
                    { value: 'HAUTE', label: t('crm.form.priorityHigh') },
                    { value: 'URGENTE', label: t('crm.form.priorityUrgent') },
                  ].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-form-field">
                <span>{t('crm.detail.status')}</span>
                <select
                  className="portal-input"
                  value={form.status}
                  onChange={(e) => onFormChange({ ...form, status: e.target.value })}
                >
                  {CRM_STATUSES.map((s) => ({ value: s.key, label: t(s.labelKey) })).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.serviceType')}</span>
                <select
                  className="portal-input"
                  value={form.serviceType}
                  onChange={(e) => onFormChange({ ...form, serviceType: e.target.value })}
                >
                  {[
                    { value: '', label: t('crm.form.serviceType') },
                    ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: labelOfValue(t, SERVICE_TYPE_LABEL_KEYS, s) })),
                  ].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-form-field">
                <span>{t('crm.col.temperature')}</span>
                <select
                  className="portal-input"
                  value={form.leadTemperature}
                  onChange={(e) => onFormChange({ ...form, leadTemperature: e.target.value })}
                >
                  {CRM_TEMPERATURES.map((tp) => ({ value: tp.key, label: t(tp.labelKey) })).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset className="crm-form-group">
            <legend>{t('crm.form.group.followup')}</legend>
            <div className="crm-form-grid">
              {isSuperAdmin && (
                <label className="crm-form-field">
                  <span>{t('crm.form.salesOptional')}</span>
                  <select
                    className="portal-input"
                    value={form.assignedTo}
                    onChange={(e) => onFormChange({ ...form, assignedTo: e.target.value })}
                  >
                    {[
                      { value: '', label: t('crm.form.salesOptional') },
                      ...admins.map((a) => ({ value: a._id, label: a.name })),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="crm-form-field">
                <span>{t('crm.col.nextAction')}</span>
                <input
                  className="portal-input"
                  type="datetime-local"
                  value={form.nextActionAt ? toDateTimeLocal(form.nextActionAt) : ''}
                  onChange={(e) => onFormChange({ ...form, nextActionAt: e.target.value })}
                />
              </label>
              <label className="crm-form-field">
                <span>{t('crm.form.internalNotes')}</span>
                <input
                  className="portal-input"
                  placeholder={t('crm.form.internalNotes')}
                  value={form.notes}
                  onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
          </fieldset>
          <DuplicatesBanner company={form.company} contactEmail={form.contactEmail} contactPhone={form.contactPhone} />
          <label className="crm-form-field" style={{ marginTop: 12 }}>
            <span>{t('crm.form.interactionNotes')}</span>
            <textarea
              className="portal-input"
              placeholder={t('crm.form.interactionNotes')}
              value={form.interactionNotes}
              onChange={(e) => onFormChange({ ...form, interactionNotes: e.target.value })}
              rows={6}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
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
