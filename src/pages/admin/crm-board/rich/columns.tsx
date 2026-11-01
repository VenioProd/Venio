import type { ReactNode } from 'react'
import type { AdminUser, Lead } from '../../../../types/crm.types'
import { PROJECT_MAP, STATUS_MAP, TEMPERATURE_MAP } from '../constants'
import type { MessageKey } from '../../../../i18n'

export type Translate = (key: MessageKey) => string

export interface ColumnContext {
  t: Translate
  adminsById: Record<string, AdminUser>
  now: Date
}

export interface RichColumn {
  key: string
  label: string
  group: 'Identité' | 'Pipeline' | 'Liens' | 'Origine' | 'Équipe' | 'Valeur' | 'Activité' | 'Qualification'
  /** Donnée ou colonne apparue avec l'enrichissement du CRM. */
  isNew?: boolean
  align?: 'right'
  /** Colonne obligatoire : identifie la ligne. */
  locked?: boolean
  sortValue: (lead: Lead, ctx: ColumnContext) => string | number
  render: (lead: Lead, ctx: ColumnContext) => ReactNode
  /** Valeur exportée en CSV. */
  csv: (lead: Lead, ctx: ColumnContext) => string
}

export const STATUS_PROBABILITY: Record<string, number> = { LEAD: 10, QUALIFIED: 25, CONTACTED: 35, DEMO: 50, PROPOSAL: 65, WON: 100, LOST: 0 }
const TEMP_ORDER = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD']
const DAY = 86_400_000

export const isOpen = (lead: Lead) => !['WON', 'LOST'].includes(lead.status) && !lead.archivedAt
export const probabilityOf = (lead: Lead) => lead.probability ?? STATUS_PROBABILITY[lead.status] ?? 0
export const weightedOf = (lead: Lead) => (isOpen(lead) && lead.budget != null ? (lead.budget * probabilityOf(lead)) / 100 : 0)
export const lastActivityOf = (lead: Lead): Date | null => {
  const dates = [lead.lastInteractionAt, lead.lastContactAt, lead.statusChangedAt, lead.createdAt].filter(Boolean).map((d) => new Date(d as string))
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
}
export const daysSince = (date: Date | null, now: Date) => (date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY)) : null)
export const isLate = (lead: Lead, now: Date) => isOpen(lead) && !!lead.nextActionAt && new Date(lead.nextActionAt).getTime() < now.getTime()

export const formatEuro = (n: number | null | undefined) =>
  n == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/[  ]/g, ' ')} €`
const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—')
const relDays = (n: number | null) => (n == null ? '—' : n === 0 ? 'Aujourd’hui' : `Il y a ${n} j`)

const dash = <span className="rich-dim">—</span>

export const RICH_COLUMNS: RichColumn[] = [
  {
    key: 'company', label: 'Lead', group: 'Identité', locked: true,
    sortValue: (l) => l.company.toLowerCase(),
    render: (l) => (
      <span className="rich-co">
        <b>{l.company}</b>
        <span>{l.contactName || l.contactEmail || '—'}</span>
      </span>
    ),
    csv: (l) => l.company,
  },
  {
    key: 'status', label: 'Statut', group: 'Pipeline',
    sortValue: (l) => Object.keys(STATUS_PROBABILITY).indexOf(l.status),
    render: (l, { t }) => {
      const s = STATUS_MAP[l.status]
      return (
        <span className="rich-pill" style={{ ['--c' as string]: s?.color ?? 'var(--sy-dim)' }}>
          <i />
          {s ? t(s.labelKey) : l.status}
        </span>
      )
    },
    csv: (l, { t }) => (STATUS_MAP[l.status] ? t(STATUS_MAP[l.status].labelKey) : l.status),
  },
  {
    key: 'project', label: 'Plateforme liée', group: 'Liens',
    sortValue: (l) => l.project || '',
    render: (l, { t }) => (PROJECT_MAP[l.project || ''] ? <span className="rich-link">{t(PROJECT_MAP[l.project || ''].labelKey)}</span> : dash),
    csv: (l, { t }) => (PROJECT_MAP[l.project || ''] ? t(PROJECT_MAP[l.project || ''].labelKey) : ''),
  },
  { key: 'source', label: 'Source', group: 'Origine', sortValue: (l) => l.source || '', render: (l) => l.source || dash, csv: (l) => l.source || '' },
  {
    key: 'sourceDetail', label: 'Détail de la source', group: 'Origine', isNew: true,
    sortValue: (l) => l.sourceDetail || '', render: (l) => (l.sourceDetail ? <span className="rich-dim">{l.sourceDetail}</span> : dash), csv: (l) => l.sourceDetail || '',
  },
  {
    key: 'assignedTo', label: 'Commercial', group: 'Équipe',
    sortValue: (l, { adminsById }) => adminsById[l.assignedTo || '']?.name || 'zzz',
    render: (l, { adminsById }) => (l.assignedTo && adminsById[l.assignedTo] ? adminsById[l.assignedTo].name : <span className="rich-pill rich-pill--warn"><i />Non assigné</span>),
    csv: (l, { adminsById }) => adminsById[l.assignedTo || '']?.name || '',
  },
  {
    key: 'externalRep', label: 'Partenaire', group: 'Équipe',
    sortValue: (l, { adminsById }) => adminsById[l.externalRep || '']?.name || '',
    render: (l, { adminsById }) => (l.externalRep && adminsById[l.externalRep] ? adminsById[l.externalRep].name : dash),
    csv: (l, { adminsById }) => adminsById[l.externalRep || '']?.name || '',
  },
  { key: 'budget', label: 'Montant', group: 'Valeur', align: 'right', sortValue: (l) => l.budget ?? -1, render: (l) => <span className="rich-num">{formatEuro(l.budget)}</span>, csv: (l) => (l.budget != null ? String(l.budget) : '') },
  {
    key: 'probability', label: 'Probabilité', group: 'Valeur', isNew: true,
    sortValue: (l) => probabilityOf(l),
    render: (l) => (
      <span className="rich-prob">
        <span><i style={{ width: `${probabilityOf(l)}%` }} /></span>
        {probabilityOf(l)} %
      </span>
    ),
    csv: (l) => String(probabilityOf(l)),
  },
  { key: 'weighted', label: 'Pondéré', group: 'Valeur', isNew: true, align: 'right', sortValue: (l) => weightedOf(l), render: (l) => <span className="rich-num">{weightedOf(l) ? formatEuro(weightedOf(l)) : '—'}</span>, csv: (l) => String(Math.round(weightedOf(l))) },
  { key: 'expectedCloseAt', label: 'Clôture prévue', group: 'Valeur', isNew: true, sortValue: (l) => l.expectedCloseAt || '', render: (l) => <span className="rich-num">{shortDate(l.expectedCloseAt)}</span>, csv: (l) => (l.expectedCloseAt ? l.expectedCloseAt.slice(0, 10) : '') },
  {
    key: 'lastInteractionAt', label: 'Dernière interaction', group: 'Activité', isNew: true,
    sortValue: (l, { now }) => daysSince(lastActivityOf(l), now) ?? 9999,
    render: (l, { now }) => {
      const d = daysSince(lastActivityOf(l), now)
      return <span className={isOpen(l) && d != null && d >= 7 ? 'rich-late' : ''}>{relDays(d)}</span>
    },
    csv: (l) => (lastActivityOf(l) ? lastActivityOf(l)!.toISOString().slice(0, 10) : ''),
  },
  {
    key: 'nextAction', label: 'Prochaine action', group: 'Activité', isNew: true,
    sortValue: (l) => l.nextActionAt || '9',
    render: (l, { now }) =>
      l.nextActionAt || l.nextActionLabel ? (
        <span className="rich-co">
          <b>{l.nextActionLabel || 'À faire'}</b>
          <span className={isLate(l, now) ? 'rich-late' : ''}>{shortDate(l.nextActionAt)}</span>
        </span>
      ) : dash,
    csv: (l) => [l.nextActionLabel, l.nextActionAt?.slice(0, 10)].filter(Boolean).join(' — '),
  },
  {
    key: 'leadTemperature', label: 'Température', group: 'Qualification',
    sortValue: (l) => TEMP_ORDER.indexOf(l.leadTemperature || 'TIEDE'),
    render: (l, { t }) => {
      const idx = TEMP_ORDER.indexOf(l.leadTemperature || 'TIEDE')
      const opt = TEMPERATURE_MAP[l.leadTemperature || 'TIEDE']
      return (
        <span className="rich-temp" title={opt ? t(opt.labelKey) : ''}>
          {[0, 1, 2, 3].map((i) => <i key={i} className={i <= idx ? 'on' : ''} style={{ ['--c' as string]: opt?.color }} />)}
          {opt ? t(opt.labelKey) : ''}
        </span>
      )
    },
    csv: (l, { t }) => (TEMPERATURE_MAP[l.leadTemperature || ''] ? t(TEMPERATURE_MAP[l.leadTemperature || ''].labelKey) : ''),
  },
  { key: 'score', label: 'Score', group: 'Qualification', align: 'right', sortValue: (l) => l.score ?? -1, render: (l) => <span className="rich-num">{l.score ?? '—'}</span>, csv: (l) => (l.score != null ? String(l.score) : '') },
  {
    key: 'tags', label: 'Tags', group: 'Qualification', isNew: true,
    sortValue: (l) => (l.tags ?? []).join(),
    render: (l) => (l.tags?.length ? <span className="rich-tags">{l.tags.slice(0, 3).map((x) => <span key={x}>{x}</span>)}</span> : dash),
    csv: (l) => (l.tags ?? []).join(' | '),
  },
  { key: 'daysInStage', label: 'Jours dans l’étape', group: 'Pipeline', isNew: true, align: 'right', sortValue: (l, { now }) => daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now) ?? 0, render: (l, { now }) => { const d = daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now); return <span className={`rich-num ${isOpen(l) && d != null && d >= 14 ? 'rich-late' : ''}`}>{d == null ? '—' : `${d} j`}</span> }, csv: (l, { now }) => String(daysSince(l.statusChangedAt ? new Date(l.statusChangedAt) : null, now) ?? '') },
  { key: 'sector', label: 'Secteur', group: 'Identité', isNew: true, sortValue: (l) => l.sector || '', render: (l) => l.sector || dash, csv: (l) => l.sector || '' },
]

export const COLUMN_MAP: Record<string, RichColumn> = Object.fromEntries(RICH_COLUMNS.map((c) => [c.key, c]))
export const DEFAULT_COLUMNS = ['company', 'status', 'project', 'source', 'assignedTo', 'budget', 'probability', 'weighted', 'lastInteractionAt', 'nextAction', 'leadTemperature', 'tags']
export const COLUMN_GROUPS = ['Identité', 'Pipeline', 'Liens', 'Origine', 'Équipe', 'Valeur', 'Activité', 'Qualification'] as const
