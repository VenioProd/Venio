import { Link } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatMoney, formatNumber } from '../../../i18n/format'
import type { RoleKpi } from '../../../types/workspace.types'
import type { PortfolioOverview } from '../projects-portfolio/portfolio'
import type { DashboardFigures, TicketStats } from './hooks'

interface Card {
  id: string
  label: string
  value: string
  sub?: string
  to: string
}

export interface PulseProps {
  loading: boolean
  dashboard: DashboardFigures | null
  portfolio: PortfolioOverview | null
  tickets: TicketStats | null
  kpis: RoleKpi[]
  canCrm: boolean
}

const KPI_KEYS = new Set([
  'hotLeads',
  'openDeals',
  'activeInterns',
  'pendingReports',
  'draftEntries',
  'vatDeclarations',
  'myTasks',
  'myReports',
  'activeProjects',
  'tasksInProgress',
])

/**
 * Pouls : chiffres-clés déjà calculés par les routes existantes. Pas de
 * tendance ni de delta : aucun instantané quotidien n'est stocké.
 */
export default function Pulse({ loading, dashboard, portfolio, tickets, kpis, canCrm }: PulseProps) {
  const { t } = useI18n()
  const money = (n: number) => formatMoney(n, 'EUR', { maximumFractionDigits: 0 })
  const cards: Card[] = []

  if (dashboard && canCrm)
    cards.push({
      id: 'pipeline',
      label: t('home.pulse.pipeline'),
      value: money(dashboard.pipelineValue),
      sub: t('home.pulse.pipelineSub'),
      to: '/admin/crm/suivre/pipeline',
    })
  if (dashboard && dashboard.totalRevenue !== null)
    cards.push({
      id: 'invoiced',
      label: t('home.pulse.invoiced'),
      value: money(dashboard.totalRevenue),
      sub: t('home.pulse.invoicedSub'),
      to: '/admin/analytics/business',
    })
  if (tickets)
    cards.push({
      id: 'tickets',
      label: t('home.pulse.tickets'),
      value: formatNumber(tickets.open + tickets.inProgress),
      sub: t('home.pulse.ticketsSub', { count: tickets.inProgress }),
      to: '/admin/demandes/equipe',
    })
  if (portfolio) {
    cards.push({
      id: 'projects',
      label: t('home.pulse.activeProjects'),
      value: formatNumber(portfolio.pulse.active),
      sub: t('home.pulse.lateSub', { count: portfolio.pulse.late }),
      to: '/admin/projets/clients',
    })
    cards.push({
      id: 'due',
      label: t('home.pulse.due7'),
      value: formatNumber(portfolio.pulse.dueIn7Days),
      sub: t('home.pulse.due48Sub', { count: portfolio.pulse.dueIn48h }),
      to: '/admin/projets/clients',
    })
  } else if (dashboard) {
    cards.push({
      id: 'projects',
      label: t('home.pulse.activeProjects'),
      value: formatNumber(dashboard.activeProjectCount),
      to: '/admin/projets/clients',
    })
  }
  // Rôles sans ces modules (RH, comptable, stagiaire…) : leurs compteurs de rôle complètent.
  for (const k of kpis) {
    if (cards.length >= 5) break
    if (k.key === 'activeProjects' && cards.some((c) => c.id === 'projects')) continue
    const label = k.key && KPI_KEYS.has(k.key) ? t(`home.pulse.kpi.${k.key}` as MessageKey) : k.label
    cards.push({ id: `kpi-${k.key ?? k.label}`, label, value: formatNumber(k.value), to: k.link })
  }

  return (
    <section className="hm-card" aria-labelledby="hp-title">
      <div className="hm-card-h">
        <h2 id="hp-title">{t('home.pulse.title')}</h2>
        <span className="hm-hint">{t('home.pulse.hint')}</span>
      </div>
      {loading && cards.length === 0 ? (
        <p className="hm-empty" role="status">
          {t('home.loading')}
        </p>
      ) : cards.length === 0 ? (
        <p className="hm-empty">{t('home.pulse.empty')}</p>
      ) : (
        <div className="hp-grid">
          {cards.slice(0, 5).map((c) => (
            <Link key={c.id} className="hp-card" to={c.to}>
              <span className="hp-l">{c.label}</span>
              <span className="hp-v">{c.value}</span>
              {c.sub && <span className="hp-s">{c.sub}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
