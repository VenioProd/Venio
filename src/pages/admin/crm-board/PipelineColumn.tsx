import React from 'react'
import LeadCard from './LeadCard'
import { STATUS_MAP } from './constants'
import type { Lead, PipelineColumn as PipelineColumnType, AdminUser } from '../../../types/crm.types'

interface PipelineColumnProps {
  column: PipelineColumnType
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  converting: string | null
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>, status: string) => void
  onDragStart: (event: React.DragEvent<HTMLDivElement>, leadId: string) => void
}

const PipelineColumn: React.FC<PipelineColumnProps> = ({
  column,
  admins,
  adminsById,
  canManageCrm,
  converting,
  onUpdateLead,
  onConvertToClient,
  onDrop,
  onDragStart,
}) => {
  const status = STATUS_MAP[column.status]

  return (
    <div
      className="crm-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, column.status)}
      style={{ '--column-color': status?.color || '#0ea5e9' } as React.CSSProperties}
    >
      <div className="crm-column-header">
        <span className="crm-column-title">{status?.label || column.status}</span>
        <span className="crm-column-count">{column.leads?.length || 0}</span>
      </div>
      {(column.leads || []).map((lead) => (
        <LeadCard
          key={lead._id}
          lead={lead}
          admins={admins}
          adminsById={adminsById}
          canManageCrm={canManageCrm}
          converting={converting}
          onUpdateLead={onUpdateLead}
          onConvertToClient={onConvertToClient}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  )
}

export default PipelineColumn
