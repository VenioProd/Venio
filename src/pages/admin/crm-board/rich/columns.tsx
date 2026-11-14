import type { ReactNode } from 'react'
import type { AdminUser, Lead } from '../../../../types/crm.types'
import { CRM_PRIORITIES, PRIORITY_MAP, PROJECT_MAP, STATUS_MAP, TEMPERATURE_MAP } from '../constants'
import { HandoffChip, HeatChip, HoldChip, LateChip, OwnerCell, StatusChip } from './chips'
import { CrmChip } from '../../../../components/admin/crm-ui'
import { translate, type MessageKey, type MessageParams } from '../../../../i18n'
import { formatDate, formatMoney } from '../../../../i18n/format'

export type Translate = (key: MessageKey, params?: MessageParams) => string

export interface ColumnContext {
  t: Translate
  adminsById: Record<string, AdminUser>
  now: Date
}

export interface RichColumn {
  key: string
  labelKey: MessageKey
  group: 'identity' | 'pipeline' | 'links' | 'origin' | 'team' | 'value' | 'activity' | 'qualification'
  align?: 'right'
  /** Colonne obligatoire : identifie la ligne. */
  locked?: boolean
  sortValue: (lead: Lead, ctx: ColumnContext) => string | number
  render: (lead: Lead, ctx: ColumnContext) => ReactNode
  /** Valeur exportée en CSV. */
  csv: (lead: Lead, ctx: ColumnContext) => string
}

export const STATUS_PROBABILITY: Record<string, number> = {
  LEAD: 10,
  QUALIFIED: 25,
  CONTACTED: 35,
  DEMO: 50,
  PROPOSAL: 65,
  WON: 100,
  LOST: 0,
}
const TEMP_ORDER = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD']
const DAY = 86_400_000

export const isOpen = (lead: Lead) => !['WON', 'LOST'].includes(lead.status) && !lead.archivedAt
export const probabilityOf = (lead: Lead) => lead.probability ?? STATUS_PROBABILITY[lead.status] ?? 0
export const weightedOf = (lead: Lead) =>
  isOpen(lead) && lead.budget != null ? (lead.budget * probabilityOf(lead)) / 100 : 0
export const lastActivityOf = (lead: Lead): Date | null => {
  const dates = [lead.lastInteractionAt, lead.lastContactAt, lead.statusChangedAt, lead.createdAt]
    .filter(Boolean)
    .map((d) => new Date(d as string))
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
}
export const daysSince = (date: Date | null, now: Date) =>
  date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY)) : null
export const isLate = (lead: Lead, now: Date) =>
  isOpen(lead) && !!lead.nextActionAt && new Date(lead.nextActionAt).getTime() < now.getTime()

export const formatEuro = (n: number | null | undefined) =>
  n == null ? '—' : formatMoney(n, 'EUR', { maximumFractionDigits: 0 }).replace(/[\u202f\u00a0]/g, ' ')
export const shortDate = (iso?: string | null) => (iso ? formatDate(iso, { day: 'numeric', month: 'short' }) : '—')
const relDays = (n: number | null) =>
  n == null ? '—' : n === 0 ? translate('crmRich.today') : translate('crmRich.daysAgo', { count: n })

const dash = <span className="rich-dim">—</span>

export const RICH_COLUMNS: RichColumn[] = [
  {
    key: 'company',
    labelKey: 'crmRich.col.company',
    group: 'identity',
    locked: true,
    sortValue: (l) => l.company.toLowerCase(),
    render: (l) => (
      <span className="rich-co">
        <b>{l.company}</b>
        <span>{l.contactName || l.contactEmail || '—'}</span>
        {l.closingHandoff && <HandoffChip />}
      </span>
    ),
    csv: (l) => l.company,
  },
  {
    key: 'status',
    labelKey: 'crmRich.col.status',
    group: 'pipeline',
    sortValue: (l) => Object.keys(STATUS_PROBABILITY).indexOf(l.status),
    render: (l) => <StatusChip status={l.status} />,
    csv: (l, { t }) => (STATUS_MAP[l.status] ? t(STATUS_MAP[l.status].labelKey) : l.status),
  },
  {
    key: 'priority',
    labelKey: 'crm.col.priority',
    group: 'pipeline',
    sortValue: (l) => CRM_PRIORITIES.findIndex((priority) => priority.key === l.priority),
    render: (l, { t }) => (PRIORITY_MAP[l.priority || ''] ? t(PRIORITY_MAP[l.priority!].labelKey) : dash),
    csv: (l, { t }) => (PRIORITY_MAP[l.priority || ''] ? t(PRIORITY_MAP[l.priority!].labelKey) : ''),
  },
  {
    key: 'project',
    labelKey: 'crmRich.col.project',
    group: 'links',
    sortValue: (l) => l.project || '',
    render: (l, { t }) =>
      PROJECT_MAP[l.project || ''] ? (
        <span className="rich-link">{t(PROJECT_MAP[l.project || ''].labelKey)}</span>
      ) : (
        dash
      ),
    csv: (l, { t }) => (PROJECT_MAP[l.project || ''] ? t(PROJECT_MAP[l.project || ''].labelKey) : ''),
  },
  {
    key: 'source',
    labelKey: 'crmRich.col.source',
    group: 'origin',
    sortValue: (l) => l.source || '',
    render: (l) => l.source || dash,
    csv: (l) => l.source || '',
  },
  {
    key: 'sourceDetail',
    labelKey: 'crmRich.col.sourceDetail',
    group: 'origin',
    sortValue: (l) => l.sourceDetail || '',
    render: (l) => (l.sourceDetail ? <span className="rich-dim">{l.sourceDetail}</span> : dash),
    csv: (l) => l.sourceDetail || '',
  },
  {
    key: 'assignedTo',
    labelKey: 'crmRich.col.assignedTo',
    group: 'team',
    sortValue: (l, { adminsById }) => adminsById[l.assignedTo || '']?.name || 'zzz',
    render: (l, { adminsById }) =>
      l.assignedTo && adminsById[l.assignedTo] ? (
        <OwnerCell name={adminsById[l.assignedTo].name} />
      ) : (
        <CrmChip tone="amber">{translate('crmRich.unassigned')}</CrmChip>
      ),
    csv: (l, { adminsById }) => adminsById[l.assignedTo || '']?.name || '',
  },
  {
    key: 'externalRep',
    labelKey: 'crmRich.col.externalRep',
    group: 'team',
    sortValue: (l, { adminsById }) => adminsById[l.externalRep || '']?.name || '',
    render: (l, { adminsById }) => (l.externalRep && adminsById[l.externalRep] ? adminsById[l.externalRep].name : dash),
    csv: (l, { adminsById }) => adminsById[l.externalRep || '']?.name || '',
  },
  {
    key: 'budget',
    labelKey: 'crmRich.col.budget',
    group: 'value',
    align: 'right',
    sortValue: (l) => l.budget ?? -1,
    render: (l) => <span className="rich-num">{formatEuro(l.budget)}</span>,
    csv: (l) => (l.budget != null ? String(l.budget) : ''),
  },
  {
    key: 'probability',
    labelKey: 'crmRich.col.probability',
    group: 'value',
    sortValue: (l) => probabilityOf(l),
    render: (l) => (
      <span className="rich-prob">
        <span>
          <i style={{ width: `${probabilityOf(l)}%` }} />
        </span>
        {probabilityOf(l)} %
      </span>
    ),
    csv: (l) => String(probabilityOf(l)),
  },
  {
    key: 'weighted',
    labelKey: 'crmRich.col.weighted',
    group: 'value',
    align: 'right',
    sortValue: (l) => weightedOf(l),
    render: (l) => <span className="rich-num">{weightedOf(l) ? formatEuro(weightedOf(l)) : '—'}</span>,
    csv: (l) => String(Math.round(weightedOf(l))),
  },
  {
    key: 'expectedCloseAt',
    labelKey: 'crmRich.col.expectedCloseAt',
    group: 'value',
    sortValue: (l) => l.expectedCloseAt || '',
    render: (l) => <span className="rich-num">{shortDate(l.expectedCloseAt)}</span>,
    csv: (l) => (l.expectedCloseAt ? l.expectedCloseAt.slice(0, 10) : ''),
  },
  {
    key: 'lastInteractionAt',
    labelKey: 'crmRich.col.lastInteractionAt',
    group: 'activity',
    sortValue: (l) => (l.lastInteractionAt ? new Date(l.lastInteractionAt).getTime() : 0),
    render: (l, { now }) => {
      const d = daysSince(l.lastInteractionAt ? new Date(l.lastInteractionAt) : null, now)
      return <span className={isOpen(l) && d != null && d >= 7 ? 'rich-late' : ''}>{relDays(d)}</span>
    },
    csv: (l) => l.lastInteractionAt?.slice(0, 10) ?? '',
  },
  {
    key: 'nextAction',
    labelKey: 'crmRich.col.nextAction',
    group: 'activity',
    sortValue: (l) => l.nextActionAt || '9',
    render: (l, { now }) => {
      if (!l.nextActionAt && !l.nextActionLabel && !l.callHold) return dash
      const late = isLate(l, now)
      return (
        <span
          className="rich-co rich-ellipsis"
          title={[l.nextActionLabel, shortDate(l.nextActionAt)].filter(Boolean).join(' — ')}
        >
          {l.callHold ? (
            <HoldChip />
          ) : late && l.nextActionAt ? (
            <LateChip nextActionAt={l.nextActionAt} now={now} />
          ) : null}
          {(l.nextActionAt || l.nextActionLabel) && (
            <>
              <b>{l.nextActionLabel || translate('crmRich.todo')}</b>
              <span>{shortDate(l.nextActionAt)}</span>
            </>
          )}
        </span>
      )
    },
    csv: (l) => [l.nextActionLabel, l.nextActionAt?.slice(0, 10)].filter(Boolean).join(' — '),
  },
  {
    key: 'leadTemperature',
    labelKey: 'crmRich.col.leadTemperature',
    group: 'qualification',
    sortValue: (l) => TEMP_ORDER.indexOf(l.leadTemperature || 'TIEDE'),
    render: (l) => <HeatChip lead={l} />,
    csv: (l, { t }) =>
      TEMPERATURE_MAP[l.leadTemperature || ''] ? t(TEMPERATURE_MAP[l.leadTemperature || ''].labelKey) : '',
  },
  {
    key: 'score',
    labelKey: 'crmRich.col.score',
    group: 'qualification',
    align: 'right',
    sortValue: (l) => l.score ?? -1,
    render: (l) => <span className="rich-num">{l.score ?? '—'}</span>,
    csv: (l) => (l.score != null ? String(l.score) : ''),
  },
  {
    key: 'tags',
    labelKey: 'crmRich.col.tags',
    group: 'qualification',
    sortValue: (l) => (l.tags ?? []).join(),
    render: (l) =>
      l.tags?.length ? (
        <span className="rich-tags">
          {l.tags.slice(0, 3).map((x) => (
            <span key={x}>{x}</span>
          ))}
          {l.tags.length > 3 && <span>+{l.tags.length - 3}</span>}
        </span>
      ) : (
        dash
      ),
    csv: (l) => (l.tags ?? []).join(' | '),
  },
  {
    key: 'daysInStage',
    labelKey: 'crmRich.col.daysInStage',
    group: 'pipeline',
    align: 'right',
    sortValue: (l, { now }) => daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now) ?? 0,
    render: (l, { now }) => {
      const d = daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now)
      return (
        <span className={`rich-num ${isOpen(l) && d != null && d >= 14 ? 'rich-late' : ''}`}>
          {d == null ? '—' : translate('crmRich.days', { count: d })}
        </span>
      )
    },
    csv: (l, { now }) => String(daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now) ?? ''),
  },
  {
    key: 'sector',
    labelKey: 'crmRich.col.sector',
    group: 'identity',
    sortValue: (l) => l.sector || '',
    render: (l) => l.sector || dash,
    csv: (l) => l.sector || '',
  },
]

export const COLUMN_MAP: Record<string, RichColumn> = Object.fromEntries(RICH_COLUMNS.map((c) => [c.key, c]))
export const DEFAULT_COLUMNS = [
  'company',
  'status',
  'assignedTo',
  'weighted',
  'nextAction',
  'lastInteractionAt',
  'leadTemperature',
]
export const COLUMN_GROUPS = [
  'identity',
  'pipeline',
  'links',
  'origin',
  'team',
  'value',
  'activity',
  'qualification',
] as const
