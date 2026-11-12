/** Types et logique pure de la vue d'ensemble Projets (onglet Clients). */
import { intlLocale, translate, type MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'

export type RiskCode = 'LATE' | 'BUDGET_OVER' | 'PROJECTED_LATE' | 'DUE_SOON' | 'STALE' | 'TO_BILL' | 'WAITING_CLIENT'
export type ProjectAction = 'POSTPONE' | 'REMIND_CLIENT' | 'REASSIGN' | 'RESUME' | 'INVOICE' | 'ARCHIVE'
export type SortKey = 'urgency' | 'dueDate' | 'budget' | 'name'

export interface PortfolioItem {
  _id: string
  name: string
  projectNumber: string
  status: 'EN_COURS' | 'EN_ATTENTE' | 'TERMINE'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  client: { _id: string; name: string } | null
  assignedTo: { _id: string; name: string } | null
  endDate: string | null
  budget: { amount: number | null; invoiced: number | null; currency: string }
  tasks: { total: number; done: number }
  progress: number
  expectedProgress: number | null
  daysToDue: number | null
  overdueDays: number
  budgetPct: number | null
  staleDays: number
  risks: { code: RiskCode; value: number | null }[]
  urgency: number
  actions: ProjectAction[]
}

export interface PortfolioOverview {
  pulse: {
    total: number
    active: number
    done: number
    late: number
    atRisk: number
    dueIn7Days: number
    dueIn48h: number
    toBill: number
    budget: { total: number; invoiced: number; pct: number | null }
    load: { pct: number | null; overloaded: number }
  }
  queue: PortfolioItem[]
  upcoming: {
    _id: string
    name: string
    assignedTo: { _id: string; name: string } | null
    endDate: string
    daysToDue: number
    overdueDays: number
  }[]
  workload: { _id: string; name: string; projects: number; openTasks: number; capacityHours: number; loadPct: number }[]
  items: PortfolioItem[]
}

export interface Filters {
  status: string
  assignedTo: string
  priority: string
  risk: boolean
  late: boolean
  toBill: boolean
  mine: boolean
  q: string
  sort: SortKey
}

export const EMPTY_FILTERS: Filters = {
  status: '',
  assignedTo: '',
  priority: '',
  risk: false,
  late: false,
  toBill: false,
  mine: false,
  q: '',
  sort: 'urgency',
}

export interface SavedView {
  _id: string
  name: string
  shared: boolean
  mine: boolean
  filters: Filters
}

export const BUILTIN_VIEWS: { id: string; labelKey: MessageKey; filters: Filters }[] = [
  { id: 'all', labelKey: 'portfolio.views.all', filters: EMPTY_FILTERS },
  { id: 'mine', labelKey: 'portfolio.views.mine', filters: { ...EMPTY_FILTERS, mine: true } },
  { id: 'late', labelKey: 'portfolio.views.late', filters: { ...EMPTY_FILTERS, late: true } },
  { id: 'risk', labelKey: 'portfolio.views.risk', filters: { ...EMPTY_FILTERS, risk: true } },
  { id: 'toBill', labelKey: 'portfolio.views.toBill', filters: { ...EMPTY_FILTERS, toBill: true } },
]

const hasRisk = (i: PortfolioItem, code: RiskCode) => i.risks.some((r) => r.code === code)

export function applyFilters(items: PortfolioItem[], f: Filters, meId: string | undefined): PortfolioItem[] {
  const q = f.q.trim().toLowerCase()
  const out = items.filter((i) => {
    if (f.status && i.status !== f.status) return false
    if (f.priority && i.priority !== f.priority) return false
    if (f.assignedTo && i.assignedTo?._id !== f.assignedTo) return false
    if (f.mine && (!meId || i.assignedTo?._id !== meId)) return false
    if (f.late && i.overdueDays <= 0) return false
    if (f.toBill && !hasRisk(i, 'TO_BILL')) return false
    if (f.risk && !i.risks.some((r) => r.code !== 'WAITING_CLIENT' && r.code !== 'TO_BILL')) return false
    if (q) {
      const hay = `${i.name} ${i.client?.name ?? ''} ${i.projectNumber}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const byName = (a: PortfolioItem, b: PortfolioItem) => a.name.localeCompare(b.name, intlLocale())
  const cmp: Record<SortKey, (a: PortfolioItem, b: PortfolioItem) => number> = {
    urgency: (a, b) => b.urgency - a.urgency || byName(a, b),
    dueDate: (a, b) => (a.daysToDue ?? Infinity) - (b.daysToDue ?? Infinity) || byName(a, b),
    budget: (a, b) => (b.budgetPct ?? -1) - (a.budgetPct ?? -1) || byName(a, b),
    name: byName,
  }
  return out.sort(cmp[f.sort])
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).every((k) => a[k] === b[k])
}

export function riskLabel(
  r: { code: RiskCode; value: number | null },
  item: PortfolioItem,
): { text: string; tone: 'rose' | 'amber' | 'sky' } {
  switch (r.code) {
    case 'LATE':
      return { text: translate('portfolio.risk.late', { value: r.value ?? 0 }), tone: 'rose' }
    case 'BUDGET_OVER':
      return { text: translate('portfolio.risk.budget', { value: r.value ?? 0 }), tone: 'rose' }
    case 'PROJECTED_LATE':
      return {
        text: translate('portfolio.risk.projectedLate', { progress: item.progress, value: r.value ?? 0 }),
        tone: 'amber',
      }
    case 'DUE_SOON':
      return {
        text:
          r.value === 0
            ? translate('portfolio.risk.dueToday')
            : translate('portfolio.risk.dueSoon', { value: r.value ?? 0 }),
        tone: 'amber',
      }
    case 'STALE':
      return { text: translate('portfolio.risk.stale', { value: r.value ?? 0 }), tone: 'amber' }
    case 'WAITING_CLIENT':
      return { text: translate('portfolio.risk.waitingClient'), tone: 'sky' }
    case 'TO_BILL':
      return { text: translate('portfolio.risk.toBill'), tone: 'sky' }
  }
}

/** Jour + mois abrégé dans la langue active. */
export const shortDate = (iso: string): string => formatDate(iso, { day: 'numeric', month: 'short' })

export function dueLabel(i: Pick<PortfolioItem, 'daysToDue' | 'overdueDays' | 'endDate' | 'status'>): string {
  if (!i.endDate) return '—'
  if (i.status === 'TERMINE') return shortDate(i.endDate)
  if (i.overdueDays > 0) return translate('portfolio.due.overdue', { count: i.overdueDays })
  if (i.daysToDue !== null && i.daysToDue <= 7) return translate('portfolio.due.countdown', { count: i.daysToDue })
  return shortDate(i.endDate)
}
