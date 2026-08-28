import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { Lead, AdminUser } from '../../../types/crm.types'
import { getLeadAlerts } from './constants'
import { useCrmThresholds } from './thresholdsContext'

interface LeadCardProps {
  lead: Lead
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  converting: string | null
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>, leadId: string) => void
}

const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  admins,
  adminsById,
  canManageCrm,
  converting,
  onUpdateLead,
  onConvertToClient,
  onDragStart,
}) => {
  const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < new Date()
  const assigned = adminsById[lead.assignedTo || '']
  const alerts = getLeadAlerts(lead, useCrmThresholds())
  const isCold = alerts.some((a) => a.type === 'cold')
  const isStale = alerts.some((a) => a.type === 'stale')

  return (
    <div
      className={`crm-card ${isOverdue ? 'crm-overdue' : ''} ${isCold ? 'crm-card-cold' : ''} ${isStale ? 'crm-card-stale' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, lead._id)}
    >
      <p className="crm-card-title">{lead.company}</p>
      <p className="crm-card-meta">{lead.contactName || 'Contact non renseign\u00e9'}</p>
      {alerts.length > 0 && (
        <div className="crm-card-alerts">
          {alerts.map((alert) => (
            <span
              key={alert.type}
              className="crm-alert-badge"
              style={{ '--alert-color': alert.color } as React.CSSProperties}
            >
              {alert.label}
            </span>
          ))}
        </div>
      )}
      <div className="crm-card-row">
        {lead.priority && <span className="crm-badge">{lead.priority}</span>}
        {lead.source && <span className="crm-badge">{lead.source}</span>}
        {lead.budget != null && <span className="crm-badge">{lead.budget} \u20ac</span>}
      </div>
      <div className="crm-card-row" style={{ marginTop: 8 }}>
        <CustomSelect
          className="portal-input"
          value={lead.assignedTo || ''}
          onChange={(v) => onUpdateLead(lead._id, { assignedTo: v || null })}
          options={[{ value: '', label: 'Non assign\u00e9' }, ...admins.map((a) => ({ value: a._id, label: a.name }))]}
        />
        {assigned && (
          <span className="crm-card-meta" style={{ margin: 0 }}>
            {assigned.name}
          </span>
        )}
      </div>
      {lead.nextActionAt && (
        <p className="crm-card-meta" style={{ marginTop: 8 }}>
          Prochaine action : {new Date(lead.nextActionAt).toLocaleDateString()}
        </p>
      )}
      {lead.status === 'WON' && !lead.clientAccountId && canManageCrm && (
        <button
          className="crm-btn-convert crm-btn-convert-card"
          onClick={() => onConvertToClient(lead)}
          disabled={converting === lead._id}
        >
          {converting === lead._id ? 'Conversion...' : 'Cr\u00e9er client'}
        </button>
      )}
    </div>
  )
}

export default LeadCard
