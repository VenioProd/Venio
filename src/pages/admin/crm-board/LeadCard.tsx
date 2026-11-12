import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import { formatDate, formatMoney } from '../../../i18n/format'
import type { Lead, AdminUser } from '../../../types/crm.types'
import {
  ENTITY_MAP,
  PRIORITY_MAP,
  PROJECT_MAP,
  SOURCE_LABEL_KEYS,
  getLeadAlerts,
  labelOfValue,
  leadEntity,
} from './constants'
import { useCrmThresholds } from './thresholdsContext'

interface LeadCardProps {
  lead: Lead
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  converting: string | null
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onOpenDetail: (lead: Lead) => void
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
  onOpenDetail,
}) => {
  const { t } = useI18n()
  const isOverdue = lead.nextActionAt && new Date(lead.nextActionAt) < new Date()
  const assigned = adminsById[lead.assignedTo || '']
  const projectInfo = PROJECT_MAP[lead.project || '']
  const entityInfo = ENTITY_MAP[leadEntity(lead)]!
  const alerts = getLeadAlerts(lead, useCrmThresholds())
  const isCold = alerts.some((a) => a.type === 'cold')
  const isStale = alerts.some((a) => a.type === 'stale')

  return (
    <div
      className={`crm-card ${isOverdue ? 'crm-overdue' : ''} ${isCold ? 'crm-card-cold' : ''} ${isStale ? 'crm-card-stale' : ''}`}
      draggable={canManageCrm}
      onDragStart={canManageCrm ? (e) => onDragStart(e, lead._id) : undefined}
    >
      <button type="button" className="crm-card-title" onClick={() => onOpenDetail(lead)}>
        {lead.company}
      </button>
      <p className="crm-card-meta">{lead.contactName || t('crm.card.contactMissing')}</p>
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
        <span
          className="crm-project-pill crm-entity-pill"
          data-entity={entityInfo.key}
          title={t('crm.col.entity')}
          style={{ '--project-color': entityInfo.color } as React.CSSProperties}
        >
          {t(entityInfo.labelKey)}
        </span>
        {projectInfo && lead.project !== entityInfo.key && (
          <span className="crm-project-pill" style={{ '--project-color': projectInfo.color } as React.CSSProperties}>
            {t(projectInfo.labelKey)}
          </span>
        )}
        {lead.priority && (
          <span
            className="crm-badge crm-card-priority"
            style={{ '--priority-color': PRIORITY_MAP[lead.priority]?.color } as React.CSSProperties}
          >
            {PRIORITY_MAP[lead.priority] ? t(PRIORITY_MAP[lead.priority].labelKey) : lead.priority}
          </span>
        )}
        {lead.source && <span className="crm-badge">{labelOfValue(t, SOURCE_LABEL_KEYS, lead.source)}</span>}
        {lead.budget != null && (
          <span className="crm-card-amount">{formatMoney(lead.budget, 'EUR', { maximumFractionDigits: 0 })}</span>
        )}
      </div>
      <div className="crm-card-row crm-card-assignee" style={{ marginTop: 8 }}>
        {canManageCrm && (
          <CustomSelect
            value={lead.assignedTo || ''}
            onChange={(v) => onUpdateLead(lead._id, { assignedTo: v || null })}
            options={[
              { value: '', label: t('crm.common.unassigned') },
              ...admins.map((a) => ({ value: a._id, label: a.name })),
            ]}
          />
        )}
        {(assigned || !canManageCrm) && (
          <span className="crm-card-meta" style={{ margin: 0 }}>
            {assigned ? assigned.name : t('crm.common.unassigned')}
          </span>
        )}
      </div>
      {lead.nextActionAt && (
        <p className="crm-card-meta" style={{ marginTop: 8 }}>
          {t('crm.card.nextAction', { date: formatDate(lead.nextActionAt) })}
        </p>
      )}
      {lead.status === 'WON' && !lead.clientAccountId && canManageCrm && (
        <button
          className="crm-btn-convert crm-btn-convert-card"
          onClick={() => onConvertToClient(lead)}
          disabled={converting === lead._id}
        >
          {converting === lead._id ? t('crm.common.converting') : t('crm.card.createClient')}
        </button>
      )}
    </div>
  )
}

export default LeadCard
