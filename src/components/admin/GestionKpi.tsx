import { useState, useEffect } from 'react'
import { loadJsPdf } from '../../lib/loadPdf'
import { fetchGestionKpi } from '../../services/gestion'
import type { GestionKpi as GestionKpiType, KpiPeriod } from '../../types/gestion.types'
import { useI18n } from '../../context/I18nContext'
import { formatDate } from '../../i18n/format'
import { translate, type MessageKey } from '../../i18n'

const PERIOD_LABEL_KEYS: Record<KpiPeriod, MessageKey> = {
  week: 'compA.gKpi.periodWeek',
  month: 'compA.gKpi.periodMonth',
  year: 'compA.gKpi.periodYear',
  all: 'compA.gKpi.periodAll',
}

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  A_FAIRE: 'compA.taskStatus.todo',
  EN_COURS: 'compA.taskStatus.inProgress',
  EN_REVIEW: 'compA.taskStatus.inReview',
  TERMINE: 'compA.taskStatus.done',
}

const PRIORITY_LABEL_KEYS: Record<string, MessageKey> = {
  BASSE: 'compA.priority.low',
  NORMALE: 'compA.priority.normal',
  HAUTE: 'compA.priority.high',
  URGENTE: 'compA.priority.urgent',
}

const statusLabel = (key: string) => (STATUS_LABEL_KEYS[key] ? translate(STATUS_LABEL_KEYS[key]) : key)
const priorityLabel = (key: string) => (PRIORITY_LABEL_KEYS[key] ? translate(PRIORITY_LABEL_KEYS[key]) : key)

export default function GestionKpi() {
  const { t } = useI18n()
  const [period, setPeriod] = useState<KpiPeriod>('month')
  const [userId, setUserId] = useState<string>('')
  const [kpi, setKpi] = useState<GestionKpiType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchGestionKpi(period, userId || undefined)
      .then(setKpi)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [period, userId])

  const exportPdf = async () => {
    if (!kpi) return
    const jsPDF = await loadJsPdf()
    const doc = new jsPDF()
    const now = formatDate(new Date())
    let y = 20

    doc.setFontSize(18)
    doc.setTextColor(14, 165, 233)
    doc.text(t('compA.gKpi.pdfTitle'), 14, y)
    y += 10
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(t('compA.gKpi.pdfPeriod', { period: t(PERIOD_LABEL_KEYS[period]), date: now }), 14, y)
    y += 14

    // Global stats
    doc.setFontSize(13)
    doc.setTextColor(30)
    doc.text(t('compA.gKpi.pdfGlobal'), 14, y)
    y += 8
    doc.setFontSize(10)
    doc.text(t('compA.gKpi.pdfTotalTasks', { n: kpi.totalTasks }), 14, y)
    y += 6
    doc.text(t('compA.gKpi.pdfCompleted', { n: kpi.completedTasks }), 14, y)
    y += 6
    doc.text(t('compA.gKpi.pdfOverdue', { n: kpi.overdueTasks }), 14, y)
    y += 10

    // By status
    doc.setFontSize(13)
    doc.text(t('compA.gKpi.byStatus'), 14, y)
    y += 8
    doc.setFontSize(10)
    Object.entries(kpi.tasksByStatus).forEach(([k, v]) => {
      doc.text(t('compA.gKpi.pdfLabelValue', { label: statusLabel(k), value: v }), 20, y)
      y += 6
    })
    y += 4

    // By priority
    doc.setFontSize(13)
    doc.text(t('compA.gKpi.byPriority'), 14, y)
    y += 8
    doc.setFontSize(10)
    Object.entries(kpi.tasksByPriority).forEach(([k, v]) => {
      doc.text(t('compA.gKpi.pdfLabelValue', { label: priorityLabel(k), value: v }), 20, y)
      y += 6
    })
    y += 4

    // Per-person
    if (kpi.tasksByPerson.length > 0) {
      doc.setFontSize(13)
      doc.text(t('compA.gKpi.perPerson'), 14, y)
      y += 8
      doc.setFontSize(9)
      kpi.tasksByPerson.forEach((p) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.text(
          t('compA.gKpi.pdfPersonLine', {
            name: p.name,
            total: p.total,
            completed: p.completed,
            overdue: p.overdue,
            compliance: p.complianceRate ?? '—',
            avg: p.avgTreatmentHours ?? '—',
          }),
          14,
          y,
        )
        y += 6
      })
    }

    // Brief stats
    if (kpi.briefStats && kpi.briefStats.totalBriefs > 0) {
      y += 6
      if (y > 250) {
        doc.addPage()
        y = 20
      }
      doc.setFontSize(13)
      doc.setTextColor(30)
      doc.text(t('compA.gKpi.briefsTitle', { n: kpi.briefStats.totalBriefs }), 14, y)
      y += 8
      doc.setFontSize(10)
      doc.text(t('compA.gKpi.pdfAssignedBy'), 14, y)
      y += 6
      doc.setFontSize(9)
      kpi.briefStats.byCreator.forEach((c) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.text(
          t('compA.gKpi.pdfCreatorLine', {
            name: c.name,
            total: c.total,
            valid: c.byStatus.VALIDE || 0,
            delivered: c.byStatus.LIVRE || 0,
          }),
          20,
          y,
        )
        y += 6
      })
      y += 4
      doc.setFontSize(10)
      doc.text(t('compA.gKpi.pdfReceivedBy'), 14, y)
      y += 6
      doc.setFontSize(9)
      kpi.briefStats.byDestinataire.forEach((d) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.text(
          t('compA.gKpi.pdfRecipientLine', { name: d.name, received: d.received, completed: d.completed }),
          20,
          y,
        )
        y += 6
      })
    }

    doc.save(`kpi-gestion-${period}-${now.replace(/\//g, '-')}.pdf`)
  }

  if (loading) return <div className="gestion-loading">{t('common.loading')}</div>
  if (!kpi) return <div className="gestion-empty-state">{t('compA.gKpi.loadError')}</div>

  return (
    <div className="gestion-kpi">
      <div className="gestion-kpi-controls">
        <div className="gestion-kpi-periods">
          {(Object.keys(PERIOD_LABEL_KEYS) as KpiPeriod[]).map((p) => (
            <button
              key={p}
              className={`gestion-kpi-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {t(PERIOD_LABEL_KEYS[p])}
            </button>
          ))}
        </div>
        <select className="gestion-project-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">{t('compA.gKpi.allMembers')}</option>
          {kpi.admins.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className="gestion-export-btn" onClick={exportPdf}>
          {t('compA.gKpi.exportPdf')}
        </button>
      </div>

      {/* Stat cards */}
      <div className="gestion-kpi-cards">
        <div className="gestion-kpi-card">
          <div className="gestion-kpi-card-value">{kpi.totalTasks}</div>
          <div className="gestion-kpi-card-label">{t('compA.gKpi.cardTotal')}</div>
        </div>
        <div className="gestion-kpi-card gestion-kpi-card-success">
          <div className="gestion-kpi-card-value">{kpi.completedTasks}</div>
          <div className="gestion-kpi-card-label">{t('compA.gKpi.cardCompleted')}</div>
        </div>
        <div className="gestion-kpi-card gestion-kpi-card-danger">
          <div className="gestion-kpi-card-value">{kpi.overdueTasks}</div>
          <div className="gestion-kpi-card-label">{t('compA.gKpi.cardOverdue')}</div>
        </div>
        <div className="gestion-kpi-card">
          <div className="gestion-kpi-card-value">
            {kpi.totalTasks > 0 ? Math.round((kpi.completedTasks / kpi.totalTasks) * 100) : 0}%
          </div>
          <div className="gestion-kpi-card-label">{t('compA.gKpi.cardRate')}</div>
        </div>
      </div>

      {/* Status & Priority bars */}
      <div className="gestion-kpi-grid">
        <div className="gestion-kpi-section">
          <h3>{t('compA.gKpi.byStatus')}</h3>
          {Object.entries(kpi.tasksByStatus).map(([key, val]) => (
            <div key={key} className="gestion-kpi-bar-row">
              <span className="gestion-kpi-bar-label">{statusLabel(key)}</span>
              <div className="gestion-kpi-bar-track">
                <div
                  className="gestion-kpi-bar-fill"
                  style={{
                    width: kpi.totalTasks > 0 ? `${(val / kpi.totalTasks) * 100}%` : '0%',
                    background:
                      key === 'TERMINE'
                        ? '#22c55e'
                        : key === 'EN_COURS'
                          ? 'var(--primary)'
                          : key === 'EN_REVIEW'
                            ? '#f59e0b'
                            : '#64748b',
                  }}
                />
              </div>
              <span className="gestion-kpi-bar-value">{val}</span>
            </div>
          ))}
        </div>
        <div className="gestion-kpi-section">
          <h3>{t('compA.gKpi.byPriority')}</h3>
          {Object.entries(kpi.tasksByPriority).map(([key, val]) => (
            <div key={key} className="gestion-kpi-bar-row">
              <span className="gestion-kpi-bar-label">{priorityLabel(key)}</span>
              <div className="gestion-kpi-bar-track">
                <div
                  className="gestion-kpi-bar-fill"
                  style={{
                    width: kpi.totalTasks > 0 ? `${(val / kpi.totalTasks) * 100}%` : '0%',
                    background:
                      key === 'URGENTE'
                        ? '#ef4444'
                        : key === 'HAUTE'
                          ? '#f59e0b'
                          : key === 'NORMALE'
                            ? 'var(--primary)'
                            : '#64748b',
                  }}
                />
              </div>
              <span className="gestion-kpi-bar-value">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-person table */}
      {kpi.tasksByPerson.length > 0 && (
        <div className="gestion-kpi-section">
          <h3>{t('compA.gKpi.perPerson')}</h3>
          <div className="gestion-table-wrap">
            <table className="gestion-table">
              <thead>
                <tr>
                  <th>{t('compA.gKpi.thMember')}</th>
                  <th>{t('compA.gKpi.thTotal')}</th>
                  <th>{t('compA.gKpi.cardCompleted')}</th>
                  <th>{t('compA.taskStatus.inProgress')}</th>
                  <th>{t('compA.gKpi.cardOverdue')}</th>
                  <th>{t('compA.gKpi.thDeadline')}</th>
                  <th>{t('compA.gKpi.thAvgDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {kpi.tasksByPerson.map((p) => (
                  <tr key={p.userId}>
                    <td className="gestion-cell-title">{p.name}</td>
                    <td>{p.total}</td>
                    <td style={{ color: '#22c55e' }}>{p.completed}</td>
                    <td style={{ color: 'var(--primary)' }}>{p.inProgress}</td>
                    <td style={{ color: p.overdue > 0 ? '#ef4444' : 'inherit' }}>{p.overdue}</td>
                    <td>
                      {p.complianceRate !== null ? (
                        <span
                          style={{
                            color: p.complianceRate >= 80 ? '#22c55e' : p.complianceRate >= 50 ? '#f59e0b' : '#ef4444',
                          }}
                        >
                          {p.complianceRate}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{p.avgTreatmentHours !== null ? `${p.avgTreatmentHours}h` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Brief stats */}
      {kpi.briefStats && kpi.briefStats.totalBriefs > 0 && (
        <div className="gestion-kpi-section">
          <h3>{t('compA.gKpi.briefsTitle', { n: kpi.briefStats.totalBriefs })}</h3>
          <div className="gestion-kpi-grid" style={{ border: 'none', padding: 0 }}>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                {t('compA.gKpi.assignedBySuper')}
              </h4>
              <div className="gestion-table-wrap">
                <table className="gestion-table">
                  <thead>
                    <tr>
                      <th>{t('compA.gKpi.thSuperAdmin')}</th>
                      <th>{t('compA.gKpi.thAssignedBriefs')}</th>
                      <th>{t('compA.gKpi.thValid')}</th>
                      <th>{t('compA.gKpi.thDelivered')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.briefStats.byCreator.map((c) => (
                      <tr key={c.userId}>
                        <td className="gestion-cell-title">{c.name}</td>
                        <td>{c.total}</td>
                        <td style={{ color: '#22c55e' }}>{c.byStatus.VALIDE || 0}</td>
                        <td style={{ color: 'var(--primary)' }}>{c.byStatus.LIVRE || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
                {t('compA.gKpi.receivedByMembers')}
              </h4>
              <div className="gestion-table-wrap">
                <table className="gestion-table">
                  <thead>
                    <tr>
                      <th>{t('compA.gKpi.thMember')}</th>
                      <th>{t('compA.gKpi.thReceived')}</th>
                      <th>{t('compA.gKpi.thFinished')}</th>
                      <th>{t('compA.gKpi.thRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.briefStats.byDestinataire.map((d) => (
                      <tr key={d.userId}>
                        <td className="gestion-cell-title">{d.name}</td>
                        <td>{d.received}</td>
                        <td style={{ color: '#22c55e' }}>{d.completed}</td>
                        <td>
                          {d.received > 0 ? (
                            <span style={{ color: d.completed / d.received >= 0.8 ? '#22c55e' : '#f59e0b' }}>
                              {Math.round((d.completed / d.received) * 100)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
