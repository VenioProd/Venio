import React, { useState } from 'react'
import LeadCard from './LeadCard'
import { useI18n } from '../../../context/I18nContext'
import { formatMoney } from '../../../i18n/format'
import { STATUS_MAP } from './constants'
import { STATUS_PROBABILITY, weightedOf } from './rich/columns'
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
  const [over, setOver] = useState(false)
  const [dropIndex, setDropIndex] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const collapsible = ['WON', 'LOST'].includes(column.status)
  const status = STATUS_MAP[column.status]
  const total = (column.leads || []).reduce((sum, lead) => sum + (lead.budget ?? 0), 0)
  const amount = formatMoney(total, 'EUR', { maximumFractionDigits: 0 })
  const open = !collapsible
  const weighted = formatMoney(
    (column.leads || []).reduce((sum, lead) => sum + weightedOf(lead), 0),
    'EUR',
    { maximumFractionDigits: 0 },
  )

  return (
    <div
      className={`crm-column ${over ? 'crm-column-over' : ''} ${collapsed ? 'crm-column-collapsed' : ''}`}
      data-status={column.status}
      role="group"
      aria-label={t('crmSuivre.kanban.columnAria', {
        status: status ? t(status.labelKey) : column.status,
        count: column.leads?.length || 0,
      })}
      onDragOver={(event) => {
        if (!canManageCrm) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const card = (event.target as HTMLElement).closest<HTMLElement>('[data-lead-id]')
        const index = column.leads.findIndex((lead) => lead._id === card?.dataset.leadId)
        setDropIndex(
          index < 0
            ? column.leads.length
            : index +
                (event.clientY > card!.getBoundingClientRect().top + card!.getBoundingClientRect().height / 2 ? 1 : 0),
        )
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false)
      }}
      onDragEnd={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        onDrop(event, column.status)
      }}
      style={{ '--column-color': status?.color || 'var(--primary)' } as React.CSSProperties}
    >
      <div className="crm-column-header">
        <span className="crm-column-dot" aria-hidden="true" />
        {collapsible ? (
          <button
            type="button"
            className="crm-column-title crm-column-toggle"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {status ? t(status.labelKey) : column.status} {collapsed ? '+' : '−'}
          </button>
        ) : (
          <span className="crm-column-title">{status ? t(status.labelKey) : column.status}</span>
        )}
        <span className="crm-column-count">{column.leads?.length || 0}</span>
        <span className="crm-column-total" title={t('adminOps.pilotage.pipeline.total', { amount })}>
          {amount}
        </span>
      </div>
      {open && (
        <p className="crm-column-sub">
          <span>{t('crmSuivre.kanban.weighting', { percent: STATUS_PROBABILITY[column.status] ?? 0 })}</span>
          <span>{t('crmSuivre.kanban.weighted', { amount: weighted })}</span>
        </p>
      )}
      {!collapsed && !column.leads?.length && (
        <p className="crm-column-empty">{t('adminOps.pilotage.pipeline.empty')}</p>
      )}
      {!collapsed &&
        (column.leads || []).map((lead, index) => (
          <React.Fragment key={lead._id}>
            {over && dropIndex === index && <div className="crm-drop-marker" aria-hidden="true" />}
            <LeadCard
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
          </React.Fragment>
        ))}
      {over && (collapsed || dropIndex === column.leads.length) && (
        <div className="crm-drop-marker" aria-hidden="true" />
      )}
    </div>
  )
}

export default PipelineColumn
