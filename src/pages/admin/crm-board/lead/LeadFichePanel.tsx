import CustomSelect from '../../../../components/admin/CustomSelect'
import RevenueChain from '../../../../components/admin/RevenueChain'
import { CrmChip, CrmPanelCard, CrmPropList, CrmSidePanel, type CrmTone } from '../../../../components/admin/crm-ui'
import { useI18n } from '../../../../context/I18nContext'
import { formatDateTime } from '../../../../i18n/format'
import type { AdminUser, Lead } from '../../../../types/crm.types'
import {
  CRM_ENTITIES,
  CRM_STATUSES,
  CRM_TEMPERATURES,
  ENTITY_MAP,
  leadEntity,
  PRIORITY_MAP,
  PROJECT_MAP,
  SERVICE_TYPE_LABEL_KEYS,
  SOURCE_LABEL_KEYS,
  STATUS_MAP,
  TEMPERATURE_MAP,
  labelOfValue,
} from '../constants'
import { formatEuro } from '../rich/columns'
import './lead.css'

const STATUS_TONE: Record<string, CrmTone> = {
  LEAD: 'grey',
  QUALIFIED: 'blue',
  CONTACTED: 'blue',
  DEMO: 'amber',
  PROPOSAL: 'orange',
  WON: 'green',
  LOST: 'red',
}
const PRIORITY_TONE: Record<string, CrmTone> = { BASSE: 'grey', NORMALE: 'blue', HAUTE: 'orange', URGENTE: 'red' }

interface Props {
  lead: Lead
  admins: AdminUser[]
  canManageCrm: boolean
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
}

/** Panneau de droite de la fiche : « Fiche » (champs modifiables sur place) et « Chaîne commerciale ». */
export default function LeadFichePanel({ lead, admins, canManageCrm, onUpdateLead }: Props) {
  const { t } = useI18n()
  const dash = <span className="crm-lead-dim">—</span>
  const assignee = admins.find((admin) => admin._id === lead.assignedTo)?.name
  const status = STATUS_MAP[lead.status]
  const temperature = TEMPERATURE_MAP[lead.leadTemperature || '']
  const priority = PRIORITY_MAP[lead.priority || '']
  const project = PROJECT_MAP[lead.project || '']
  const update = (patch: Record<string, unknown>) => {
    void onUpdateLead(lead._id, patch)
  }

  const items = [
    {
      key: 'status',
      label: t('crmLead.prop.status'),
      value: canManageCrm ? (
        <CustomSelect
          className="crm-lead-select"
          value={lead.status || 'LEAD'}
          onChange={(value) => update({ status: value })}
          options={CRM_STATUSES.map((option) => ({ value: option.key, label: t(option.labelKey) }))}
        />
      ) : (
        <CrmChip tone={STATUS_TONE[lead.status] ?? 'grey'} dot>
          {status ? t(status.labelKey) : lead.status}
        </CrmChip>
      ),
    },
    {
      key: 'entity',
      label: t('crmLead.prop.entity'),
      value: canManageCrm ? (
        <CustomSelect
          className="crm-lead-select"
          value={leadEntity(lead)}
          onChange={(value) => update({ entity: value })}
          options={CRM_ENTITIES.map((option) => ({ value: option.key, label: t(option.labelKey) }))}
        />
      ) : (
        t(ENTITY_MAP[leadEntity(lead)]!.labelKey)
      ),
    },
    {
      key: 'temperature',
      label: t('crmLead.prop.temperature'),
      value: canManageCrm ? (
        <CustomSelect
          className="crm-lead-select"
          value={lead.leadTemperature || 'TIEDE'}
          onChange={(value) => update({ leadTemperature: value })}
          options={CRM_TEMPERATURES.map((option) => ({ value: option.key, label: t(option.labelKey) }))}
        />
      ) : temperature ? (
        t(temperature.labelKey)
      ) : (
        (lead.leadTemperature ?? dash)
      ),
    },
    {
      key: 'assignee',
      label: t('crmLead.prop.assignee'),
      value: canManageCrm ? (
        <CustomSelect
          className="crm-lead-select"
          value={lead.assignedTo || ''}
          onChange={(value) => update({ assignedTo: value || null })}
          options={[
            { value: '', label: t('crm.common.unassigned') },
            ...admins
              .filter((admin) => ['SUPER_ADMIN', 'ADMIN'].includes(admin.role))
              .map((admin) => ({ value: admin._id, label: admin.name })),
          ]}
        />
      ) : (
        (assignee ?? t('crm.common.unassigned'))
      ),
    },
    {
      key: 'budget',
      label: t('crmLead.prop.budget'),
      value: <span className="crm-lead-mono">{formatEuro(lead.budget)}</span>,
    },
    { key: 'contact', label: t('crmLead.prop.contact'), value: lead.contactName || dash },
    { key: 'email', label: t('crmLead.prop.email'), value: lead.contactEmail || dash },
    {
      key: 'phone',
      label: t('crmLead.prop.phone'),
      value: lead.contactPhone ? <span className="crm-lead-mono">{lead.contactPhone}</span> : dash,
    },
    {
      key: 'service',
      label: t('crmLead.prop.service'),
      value: labelOfValue(t, SERVICE_TYPE_LABEL_KEYS, lead.serviceType) || dash,
    },
    ...(lead.project !== leadEntity(lead)
      ? [
          {
            key: 'project',
            label: t('crmLead.prop.project'),
            value: project ? (
              <span className="crm-lead-project" style={{ ['--crm-lead-project' as string]: project.color }}>
                {t(project.labelKey)}
              </span>
            ) : (
              dash
            ),
          },
        ]
      : []),
    {
      key: 'source',
      label: t('crmLead.prop.source'),
      value: labelOfValue(t, SOURCE_LABEL_KEYS, lead.source) || dash,
    },
    ...(priority
      ? [
          {
            key: 'priority',
            label: t('crmLead.prop.priority'),
            value: <CrmChip tone={PRIORITY_TONE[lead.priority!] ?? 'grey'}>{t(priority.labelKey)}</CrmChip>,
          },
        ]
      : []),
    ...(lead.lastInteractionAt
      ? [{ key: 'last', label: t('crmLead.prop.lastExchange'), value: formatDateTime(lead.lastInteractionAt) }]
      : []),
  ]

  return (
    <CrmSidePanel label={t('crmLead.panel.aria')}>
      <CrmPanelCard title={t('crmLead.panel.title')} id="crm-lead-fiche-title">
        <CrmPropList items={items} />
      </CrmPanelCard>
      <CrmPanelCard title={t('crm.detail.revenueChain')} id="crm-lead-chain-title">
        <RevenueChain leadId={lead._id} canManage={canManageCrm} />
      </CrmPanelCard>
    </CrmSidePanel>
  )
}
