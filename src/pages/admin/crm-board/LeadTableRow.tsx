import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { Lead, AdminUser } from '../../../types/crm.types'
import {
  CRM_STATUSES,
  CRM_PRIORITIES,
  CRM_TEMPERATURES,
  PRIORITY_MAP,
  TEMPERATURE_MAP,
  getLeadAlerts,
} from './constants'

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
  onTransferToArrow?: (leadId: string) => void
  isSelected?: boolean
  onToggleSelect?: () => void
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
  onTransferToArrow,
  isSelected,
  onToggleSelect,
}) => {
  const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < new Date()
  const assigned = adminsById[lead.assignedTo || '']
  const priorityInfo = PRIORITY_MAP[lead.priority || '']
  const alerts = getLeadAlerts(lead)
  const isCold = alerts.some((a) => a.type === 'cold')
  const isStale = alerts.some((a) => a.type === 'stale')

  return (
    <tr
      className={`crm-table-row ${isOverdue ? 'crm-row-overdue' : ''} ${isCold ? 'crm-row-cold' : ''} ${isStale ? 'crm-row-stale' : ''} ${isSelected ? 'crm-row-selected' : ''}`}
    >
      {onToggleSelect && (
        <td className="crm-td" style={{ padding: '0 8px', width: 36 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={onToggleSelect}
            style={{ cursor: 'pointer', width: 15, height: 15 }}
          />
        </td>
      )}
      <td className="crm-td crm-td-company">
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
      </td>
      <td className="crm-td">{lead.contactName || '\u2014'}</td>
      <td className="crm-td crm-td-email">
        {lead.contactEmail ? (
          <a href={`mailto:${lead.contactEmail}`} className="crm-email-link">
            {lead.contactEmail}
          </a>
        ) : (
          '\u2014'
        )}
      </td>
      <td className="crm-td">{lead.contactPhone || '\u2014'}</td>
      <td className="crm-td">{lead.source ? <span className="crm-table-badge">{lead.source}</span> : '\u2014'}</td>
      <td className="crm-td">
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select"
            value={lead.priority || 'NORMALE'}
            onChange={(v) => onUpdateLead(lead._id, { priority: v })}
            options={CRM_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))}
          />
        ) : (
          <span
            className="crm-priority-badge"
            style={{ '--priority-color': priorityInfo?.color || 'var(--primary)' } as React.CSSProperties}
          >
            {priorityInfo?.label || lead.priority}
          </span>
        )}
      </td>
      <td className="crm-td crm-td-budget">
        {lead.budget != null ? `${lead.budget.toLocaleString('fr-FR')} \u20ac` : '\u2014'}
      </td>
      <td className="crm-td crm-td-service">
        {lead.serviceType ? <span className="crm-table-badge">{lead.serviceType}</span> : '\u2014'}
      </td>
      <td className="crm-td crm-td-temperature">
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select"
            value={lead.leadTemperature || 'TIEDE'}
            onChange={(v) => onUpdateLead(lead._id, { leadTemperature: v })}
            options={CRM_TEMPERATURES.map((t) => ({ value: t.key, label: t.label }))}
          />
        ) : (
          <span
            className="crm-temperature-badge"
            style={
              { '--temp-color': TEMPERATURE_MAP[lead.leadTemperature || '']?.color || '#f59e0b' } as React.CSSProperties
            }
          >
            {TEMPERATURE_MAP[lead.leadTemperature || '']?.label || lead.leadTemperature}
          </span>
        )}
      </td>
      <td className="crm-td">
        {canManageCrm ? (
          <CustomSelect
            className="crm-inline-select crm-inline-assignee"
            value={lead.assignedTo || ''}
            onChange={(v) => onUpdateLead(lead._id, { assignedTo: v || null })}
            options={[
              { value: '', label: 'Non assign\u00e9' },
              ...admins.map((a) => ({ value: a._id, label: a.name })),
            ]}
          />
        ) : (
          <span>{assigned?.name || 'Non assign\u00e9'}</span>
        )}
      </td>
      <td className={`crm-td ${isOverdue ? 'crm-td-overdue' : ''}`}>
        {lead.nextActionAt ? new Date(lead.nextActionAt).toLocaleDateString('fr-FR') : '\u2014'}
        {isOverdue && <span className="crm-overdue-tag">En retard</span>}
      </td>
      <td className="crm-td crm-td-date">
        {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('fr-FR') : '\u2014'}
      </td>
      {canManageCrm && (
        <td className="crm-td crm-td-actions">
          <div className="crm-row-actions">
            {/* Status change dropdown */}
            <CustomSelect
              className="crm-inline-select crm-inline-status"
              value={lead.status}
              onChange={(v) => onUpdateLead(lead._id, { status: v })}
              options={CRM_STATUSES.map((s) => ({ value: s.key, label: `\u2192 ${s.label}` }))}
            />
            {/* Transfer to Arrow button */}
            {onTransferToArrow && (
              <button
                className="crm-btn-notes"
                onClick={() => onTransferToArrow(lead._id)}
                title="Transf\u00e9rer vers Arrow \u00c9coles"
                style={{ color: 'var(--primary)' }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </button>
            )}
            {/* Notes button */}
            <button
              className="crm-btn-notes"
              onClick={() => onExpandLead(lead)}
              title="Voir/\u00e9diter les notes d'interactions"
            >
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
                title="Convertir en client"
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
                  Oui
                </button>
                <button className="crm-btn-cancel-delete" onClick={() => onSetDeleteConfirm(null)}>
                  Non
                </button>
              </div>
            ) : (
              <button className="crm-btn-delete" onClick={() => onSetDeleteConfirm(lead._id)} title="Supprimer">
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
