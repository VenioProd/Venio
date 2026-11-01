import React from 'react'
import { loadJsPdf } from '../../../lib/loadPdf'
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from './types'
import type { KpiData } from './types'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'

interface TicketStatsProps {
  kpi: KpiData | null
  kpiPeriod: string
  setKpiPeriod: (v: string) => void
}

const TicketStats: React.FC<TicketStatsProps> = ({ kpi, kpiPeriod, setKpiPeriod }) => {
  const { t } = useI18n()
  const exportKpiPdf = async () => {
    if (!kpi) return
    const jsPDF = await loadJsPdf()
    const periodLabels: Record<string, string> = {
      week: t('orgs.tickets.stats.periodWeek'),
      month: t('orgs.tickets.stats.periodMonth'),
      all: t('orgs.tickets.stats.periodAll'),
    }
    const doc = new jsPDF()
    const now = formatDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric' })
    let y = 20

    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(t('orgs.tickets.stats.pdfTitle'), 14, y)
    y += 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(t('orgs.tickets.stats.pdfPeriod', { period: periodLabels[kpiPeriod] || kpiPeriod, date: now }), 14, y)
    y += 14

    // Separator
    doc.setDrawColor(14, 165, 233)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 10

    // Main KPIs
    doc.setTextColor(0)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(t('orgs.tickets.stats.pdfKeyIndicators'), 14, y)
    y += 9

    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    const kpis = [
      [t('orgs.tickets.stats.created'), `${kpi.totalCreated}`],
      [t('orgs.tickets.stats.resolved'), `${kpi.resolved}`],
      [t('orgs.tickets.stats.pending'), `${kpi.open + kpi.inProgress}`],
      [t('orgs.tickets.stats.repliesGiven'), `${kpi.totalReplies}`],
      [t('orgs.tickets.stats.resolutionRate'), `${kpi.resolutionRate}%`],
      [
        t('orgs.tickets.stats.avgFirstResponse'),
        kpi.avgResponseTime !== null ? `${kpi.avgResponseTime}h` : t('orgs.tickets.stats.notAvailable'),
      ],
      [t('orgs.tickets.stats.archivedTickets'), `${kpi.archived}`],
    ]
    kpis.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal')
      doc.text(label, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(val, 120, y)
      y += 7
    })
    y += 6

    // By category
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(t('orgs.tickets.stats.pdfByCategory'), 14, y)
    y += 9
    doc.setFontSize(11)
    Object.entries(CATEGORY_CONFIG).forEach(([key, cfg]) => {
      const count = kpi.byCategory[key] || 0
      const pct = kpi.totalCreated > 0 ? Math.round((count / kpi.totalCreated) * 100) : 0
      doc.setFont('helvetica', 'normal')
      doc.text(`${t(cfg.labelKey)}`, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`${count}  (${pct}%)`, 120, y)
      y += 7
    })
    y += 6

    // By priority
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(t('orgs.tickets.stats.pdfByPriority'), 14, y)
    y += 9
    doc.setFontSize(11)
    Object.entries(PRIORITY_CONFIG).forEach(([key, cfg]) => {
      const count = kpi.byPriority[key] || 0
      const pct = kpi.totalCreated > 0 ? Math.round((count / kpi.totalCreated) * 100) : 0
      doc.setFont('helvetica', 'normal')
      doc.text(`${t(cfg.labelKey)}`, 18, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`${count}  (${pct}%)`, 120, y)
      y += 7
    })
    y += 6

    // Top authors
    if (kpi.topAuthors.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(t('orgs.tickets.stats.topRequesters'), 14, y)
      y += 9
      doc.setFontSize(11)
      kpi.topAuthors.forEach((a) => {
        doc.setFont('helvetica', 'normal')
        doc.text(a.name, 18, y)
        doc.setFont('helvetica', 'bold')
        doc.text(t('orgs.tickets.stats.ticketCount', { count: a.count }), 120, y)
        y += 7
      })
    }

    // Footer
    y = 280
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    doc.text(t('orgs.tickets.stats.pdfFooter'), 14, y)
    doc.text(now, 196, y, { align: 'right' })

    const periodFile = kpiPeriod === 'week' ? 'semaine' : kpiPeriod === 'month' ? 'mois' : 'complet'
    doc.save(`kpi-tickets-${periodFile}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  if (!kpi) return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('common.loading')}</p>

  return (
    <div className="ticket-kpi">
      {/* Period selector + Export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="ticket-kpi-period">
          {[
            { value: 'week', label: t('orgs.tickets.stats.periodWeek') },
            { value: 'month', label: t('orgs.tickets.stats.periodMonth') },
            { value: 'all', label: t('orgs.tickets.stats.periodAllShort') },
          ].map((p) => (
            <button
              key={p.value}
              className={`ticket-kpi-period-btn ${kpiPeriod === p.value ? 'active' : ''}`}
              onClick={() => setKpiPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className="ticket-export-btn" onClick={exportKpiPdf}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t('orgs.tickets.stats.downloadPdf')}
        </button>
      </div>

      {/* Main KPI cards */}
      <div className="ticket-kpi-grid">
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--primary)' }}>
            {kpi.totalCreated}
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.created')}</span>
        </div>
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--good)' }}>
            {kpi.resolved}
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.resolved')}</span>
        </div>
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--warning)' }}>
            {kpi.open + kpi.inProgress}
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.pending')}</span>
        </div>
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--text-primary)' }}>
            {kpi.totalReplies}
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.repliesGiven')}</span>
        </div>
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--primary)' }}>
            {kpi.resolutionRate}%
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.resolutionRate')}</span>
        </div>
        <div className="ticket-kpi-card">
          <span className="ticket-kpi-value" style={{ color: 'var(--text-secondary)' }}>
            {kpi.avgResponseTime !== null ? `${kpi.avgResponseTime}h` : '—'}
          </span>
          <span className="ticket-kpi-label">{t('orgs.tickets.stats.avgFirstResponse')}</span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="ticket-kpi-sections">
        {/* Par categorie */}
        <div className="ticket-kpi-section">
          <h3>{t('orgs.tickets.stats.byCategory')}</h3>
          <div className="ticket-kpi-bars">
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
              const count = kpi.byCategory[key] || 0
              const pct = kpi.totalCreated > 0 ? (count / kpi.totalCreated) * 100 : 0
              return (
                <div key={key} className="ticket-kpi-bar-row">
                  <span className="ticket-kpi-bar-label">{t(cfg.labelKey)}</span>
                  <div className="ticket-kpi-bar-track">
                    <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                  </div>
                  <span className="ticket-kpi-bar-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Par priorite */}
        <div className="ticket-kpi-section">
          <h3>{t('orgs.tickets.stats.byPriority')}</h3>
          <div className="ticket-kpi-bars">
            {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
              const count = kpi.byPriority[key] || 0
              const pct = kpi.totalCreated > 0 ? (count / kpi.totalCreated) * 100 : 0
              return (
                <div key={key} className="ticket-kpi-bar-row">
                  <span className="ticket-kpi-bar-label">{t(cfg.labelKey)}</span>
                  <div className="ticket-kpi-bar-track">
                    <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: cfg.color }} />
                  </div>
                  <span className="ticket-kpi-bar-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top auteurs */}
        {kpi.topAuthors.length > 0 && (
          <div className="ticket-kpi-section">
            <h3>{t('orgs.tickets.stats.topRequesters')}</h3>
            <div className="ticket-kpi-bars">
              {kpi.topAuthors.map((a) => {
                const pct = kpi.totalCreated > 0 ? (a.count / kpi.totalCreated) * 100 : 0
                return (
                  <div key={a.name} className="ticket-kpi-bar-row">
                    <span className="ticket-kpi-bar-label">{a.name}</span>
                    <div className="ticket-kpi-bar-track">
                      <div className="ticket-kpi-bar-fill" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                    </div>
                    <span className="ticket-kpi-bar-count">{a.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TicketStats
