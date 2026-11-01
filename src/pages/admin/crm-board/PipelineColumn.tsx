import React from 'react'
import LeadCard from './LeadCard'
import { useI18n } from '../../../context/I18nContext'
import { formatMoney } from '../../../i18n/format'
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
  onOpenDetail: (lead: Lead) => void
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
  onOpenDetail,
}) => {
  const { t } = useI18n()
  const status = STATUS_MAP[column.status]
  const total = (column.leads || []).reduce((sum, lead) => sum + (lead.budget ?? 0), 0)
  const amount = formatMoney(total, 'EUR', { maximumFractionDigits: 0 })

  return (
    <div
      className="crm-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, column.status)}
      style={{ '--column-color': status?.color || 'var(--primary)' } as React.CSSProperties}
    >
      <div className="crm-column-header">
        <span className="crm-column-dot" aria-hidden="true" />
        <span className="crm-column-title">{status ? t(status.labelKey) : column.status}</span>
        <span className="crm-column-count">{column.leads?.length || 0}</span>
        <span className="crm-column-total" title={t('adminOps.pilotage.pipeline.total', { amount })}>
          {amount}
        </span>
      </div>
      {!column.leads?.length && <p className="crm-column-empty">{t('adminOps.pilotage.pipeline.empty')}</p>}
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
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  )
}

export default PipelineColumn
