import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import { formatDate, formatMoney } from '../../../i18n/format'
import type { Lead, AdminUser } from '../../../types/crm.types'
import {
  CRM_STATUSES,
  CRM_PRIORITIES,
  CRM_TEMPERATURES,
  PRIORITY_MAP,
  PROJECT_MAP,
  TEMPERATURE_MAP,
  SERVICE_TYPE_LABEL_KEYS,
  SOURCE_LABEL_KEYS,
  getLeadAlerts,
  labelOfValue,
} from './constants'
import { useCrmThresholds } from './thresholdsContext'

interface LeadTableRowProps {
  lead: Lead
  groupColor: string
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  converting: string | null
  deleteConfirm: string | null
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDeleteLead: (leadId: string) => Promise<void>
  onSetDeleteConfirm: (id: string | null) => void
  onExpandLead: (lead: Lead) => void
}

const LeadTableRow: React.FC<LeadTableRowProps> = ({
  lead,
  groupColor,
  admins,
  adminsById,
  canManageCrm,
  converting,
  deleteConfirm,
  onUpdateLead,
  onConvertToClient,
  onDeleteLead,
  onSetDeleteConfirm,
  onExpandLead,
}) => {
  const { t } = useI18n()
  const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < new Date()
  const assigned = adminsById[lead.assignedTo || '']
  const priorityInfo = PRIORITY_MAP[lead.priority || '']
  const projectInfo = PROJECT_MAP[lead.project || '']
  const alerts = getLeadAlerts(lead, useCrmThresholds())
  const isCold = alerts.some((a) => a.type === 'cold')
  const isStale = alerts.some((a) => a.type === 'stale')

  return (
    <tr
      className={`crm-table-row ${isOverdue ? 'crm-row-overdue' : ''} ${isCold ? 'crm-row-cold' : ''} ${isStale ? 'crm-row-stale' : ''}`}
    >
      <td className="crm-td crm-td-company">
        <div className="crm-company-content">
          <span className="crm-row-color-indicator" style={{ background: groupColor }} />
          {lead.company}
          {alerts.length > 0 && (
            <span className="crm-alerts-inline">
              {alerts.map((alert) => (
                <span
                  key={alert.type}
                  className="crm-alert-badge"
                  style={{ '--alert-color': alert.color } as React.CSSProperties}
                >
                  {alert.label}
                </span>
              ))}
            </span>
          )}
        </div>
      </td>
      <td className="crm-td" data-label={t('crm.col.contact')}>
        {lead.contactName || '\u2014'}
      </td>
      <td className="crm-td crm-td-email" data-label={t('crm.col.email')}>
        {lead.contactEmail ? (
          <a href={`mailto:${lead.contactEmail}`} className="crm-email-link">
            {lead.contactEmail}
          </a>
        ) : (
          '\u2014'
        )}
      </td>
      <td className="crm-td" data-label={t('crm.col.phone')}>
        {lead.contactPhone || '\u2014'}
      </td>
      <td className="crm-td" data-label={t('crm.col.source')}>
        {lead.source ? (
          <span className="crm-table-badge">{labelOfValue(t, SOURCE_LABEL_KEYS, lead.source)}</span>
        ) : (
          '\u2014'
        )}
      </td>
      <td className="crm-td crm-td-project" data-label={t('crm.col.project')}>
        {projectInfo ? (
          <span className="crm-project-pill" style={{ '--project-color': projectInfo.color } as React.CSSProperties}>
            {t(projectInfo.labelKey)}
          </span>
        ) : (
          '\u2014'
        )}
      </td>
      <td className="crm-td" data-label={t('crm.col.priority')}>
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select"
            value={lead.priority || 'NORMALE'}
            onChange={(v) => onUpdateLead(lead._id, { priority: v })}
            options={CRM_PRIORITIES.map((p) => ({ value: p.key, label: t(p.labelKey) }))}
          />
        ) : (
          <span
            className="crm-priority-badge"
            style={{ '--priority-color': priorityInfo?.color || 'var(--primary)' } as React.CSSProperties}
          >
            {priorityInfo ? t(priorityInfo.labelKey) : lead.priority}
          </span>
        )}
      </td>
      <td className="crm-td crm-td-budget" data-label={t('crm.col.budget')}>
        {lead.budget != null ? formatMoney(lead.budget, 'EUR', { maximumFractionDigits: 2 }) : '\u2014'}
      </td>
      <td className="crm-td crm-td-service" data-label={t('crm.col.service')}>
        {lead.serviceType ? (
          <span className="crm-table-badge">{labelOfValue(t, SERVICE_TYPE_LABEL_KEYS, lead.serviceType)}</span>
        ) : (
          '\u2014'
        )}
      </td>
      <td className="crm-td crm-td-temperature" data-label={t('crm.col.temperature')}>
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select"
            value={lead.leadTemperature || 'TIEDE'}
            onChange={(v) => onUpdateLead(lead._id, { leadTemperature: v })}
            options={CRM_TEMPERATURES.map((tp) => ({ value: tp.key, label: t(tp.labelKey) }))}
          />
        ) : (
          <span
            className="crm-temperature-badge"
            style={
              {
                '--temp-color': TEMPERATURE_MAP[lead.leadTemperature || '']?.color || 'var(--warning)',
              } as React.CSSProperties
            }
          >
            {TEMPERATURE_MAP[lead.leadTemperature || '']
              ? t(TEMPERATURE_MAP[lead.leadTemperature || ''].labelKey)
              : lead.leadTemperature}
          </span>
        )}
      </td>
      <td className="crm-td crm-td-assignee" data-label={t('crm.col.sales')}>
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select crm-inline-assignee"
            value={lead.assignedTo || ''}
            onChange={(v) => onUpdateLead(lead._id, { assignedTo: v || null })}
            options={[
              { value: '', label: t('crm.common.unassigned') },
              ...admins.map((a) => ({ value: a._id, label: a.name })),
            ]}
          />
        ) : (
          <span>{assigned?.name || t('crm.common.unassigned')}</span>
        )}
      </td>
      <td className={`crm-td ${isOverdue ? 'crm-td-overdue' : ''}`} data-label={t('crm.col.nextAction')}>
        {lead.nextActionAt ? formatDate(lead.nextActionAt) : '\u2014'}
        {isOverdue && <span className="crm-overdue-tag">{t('crm.alert.overdue')}</span>}
      </td>
      <td className="crm-td crm-td-date" data-label={t('crm.col.updatedAt')}>
        {lead.updatedAt ? formatDate(lead.updatedAt) : '\u2014'}
      </td>
      {canManageCrm && (
        <td className="crm-td crm-td-actions">
          <div className="crm-row-actions">
            {/* Status change dropdown */}
            <CustomSelect
              className="crm-inline-select crm-inline-status"
              value={lead.status}
              onChange={(v) => onUpdateLead(lead._id, { status: v })}
              options={CRM_STATUSES.map((s) => ({ value: s.key, label: `\u2192 ${t(s.labelKey)}` }))}
            />
            {/* Notes button */}
            <button className="crm-btn-notes" onClick={() => onExpandLead(lead)} title={t('crm.row.viewNotes')}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
            {/* Convert to client button (only for WON leads) */}
            {lead.status === 'WON' && !lead.clientAccountId && (
              <button
                className="crm-btn-convert"
                onClick={() => onConvertToClient(lead)}
                disabled={converting === lead._id}
                title={t('crm.row.convertToClient')}
              >
                {converting === lead._id ? (
                  '...'
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                )}
              </button>
            )}
            {/* Delete button */}
            {deleteConfirm === lead._id ? (
              <div className="crm-delete-confirm">
                <button className="crm-btn-confirm-delete" onClick={() => onDeleteLead(lead._id)}>
                  {t('common.yes')}
                </button>
                <button className="crm-btn-cancel-delete" onClick={() => onSetDeleteConfirm(null)}>
                  {t('common.no')}
                </button>
              </div>
            ) : (
              <button
                className="crm-btn-delete"
                onClick={() => onSetDeleteConfirm(lead._id)}
                title={t('common.delete')}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

export default LeadTableRow
