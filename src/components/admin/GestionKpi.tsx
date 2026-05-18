import { useState, useEffect } from 'react'
import { fetchGestionKpi } from '../../services/gestion'
import type { GestionKpi as GestionKpiType, KpiPeriod } from '../../types/gestion.types'

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  week: 'Cette semaine',
  month: 'Ce mois',
  year: 'Cette annee',
  all: 'Tout',
}

const STATUS_LABELS: Record<string, string> = {
  A_FAIRE: 'A faire',
  EN_COURS: 'En cours',
  EN_REVIEW: 'En review',
  TERMINE: 'Termine',
}

const PRIORITY_LABELS: Record<string, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente',
}

export default function GestionKpi() {
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
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const now = new Date().toLocaleDateString('fr-FR')
    let y = 20

    doc.setFontSize(18)
    doc.setTextColor(14, 165, 233)
    doc.text('KPI Gestion de Projets', 14, y)
    y += 10
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Periode : ${PERIOD_LABELS[period]} — Genere le ${now}`, 14, y)
    y += 14

    // Global stats
    doc.setFontSize(13)
    doc.setTextColor(30)
    doc.text('Statistiques globales', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.text(`Total taches : ${kpi.totalTasks}`, 14, y); y += 6
    doc.text(`Terminees : ${kpi.completedTasks}`, 14, y); y += 6
    doc.text(`En retard : ${kpi.overdueTasks}`, 14, y); y += 10

    // By status
    doc.setFontSize(13)
    doc.text('Par statut', 14, y); y += 8
    doc.setFontSize(10)
    Object.entries(kpi.tasksByStatus).forEach(([k, v]) => {
      doc.text(`${STATUS_LABELS[k] || k} : ${v}`, 20, y); y += 6
    })
    y += 4

    // By priority
    doc.setFontSize(13)
    doc.text('Par priorite', 14, y); y += 8
    doc.setFontSize(10)
    Object.entries(kpi.tasksByPriority).forEach(([k, v]) => {
      doc.text(`${PRIORITY_LABELS[k] || k} : ${v}`, 20, y); y += 6
    })
    y += 4

    // Per-person
    if (kpi.tasksByPerson.length > 0) {
      doc.setFontSize(13)
      doc.text('Performance par personne', 14, y); y += 8
      doc.setFontSize(9)
      kpi.tasksByPerson.forEach((p) => {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(`${p.name} — Total: ${p.total} | Terminees: ${p.completed} | En retard: ${p.overdue} | Compliance: ${p.complianceRate ?? '—'}% | Moy: ${p.avgTreatmentHours ?? '—'}h`, 14, y)
        y += 6
      })
    }

    // Brief stats
    if (kpi.briefStats && kpi.briefStats.totalBriefs > 0) {
      y += 6
      if (y > 250) { doc.addPage(); y = 20 }
      doc.setFontSize(13)
      doc.setTextColor(30)
      doc.text(`Briefs de mission (${kpi.briefStats.totalBriefs} total)`, 14, y); y += 8
      doc.setFontSize(10)
      doc.text('Attribues par :', 14, y); y += 6
      doc.setFontSize(9)
      kpi.briefStats.byCreator.forEach((c) => {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(`${c.name} : ${c.total} briefs (Valides: ${c.byStatus.VALIDE || 0}, Livres: ${c.byStatus.LIVRE || 0})`, 20, y)
        y += 6
      })
      y += 4
      doc.setFontSize(10)
      doc.text('Recus par :', 14, y); y += 6
      doc.setFontSize(9)
      kpi.briefStats.byDestinataire.forEach((d) => {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.text(`${d.name} : ${d.received} recus, ${d.completed} termines`, 20, y)
        y += 6
      })
    }

    doc.save(`kpi-gestion-${period}-${now.replace(/\//g, '-')}.pdf`)
  }

  if (loading) return <div className="gestion-loading">Chargement...</div>
  if (!kpi) return <div className="gestion-empty-state">Erreur chargement KPI</div>

  return (
    <div className="gestion-kpi">
      <div className="gestion-kpi-controls">
        <div className="gestion-kpi-periods">
          {(Object.keys(PERIOD_LABELS) as KpiPeriod[]).map((p) => (
            <button
              key={p}
              className={`gestion-kpi-period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <select
          className="gestion-project-select"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Tous les membres</option>
          {kpi.admins.map((a) => (
            <option key={a._id} value={a._id}>{a.name}</option>
          ))}
        </select>
        <button className="gestion-export-btn" onClick={exportPdf}>Exporter PDF</button>
      </div>

      {/* Stat cards */}
      <div className="gestion-kpi-cards">
        <div className="gestion-kpi-card">
          <div className="gestion-kpi-card-value">{kpi.totalTasks}</div>
          <div className="gestion-kpi-card-label">Total taches</div>
        </div>
        <div className="gestion-kpi-card gestion-kpi-card-success">
          <div className="gestion-kpi-card-value">{kpi.completedTasks}</div>
          <div className="gestion-kpi-card-label">Terminees</div>
        </div>
        <div className="gestion-kpi-card gestion-kpi-card-danger">
          <div className="gestion-kpi-card-value">{kpi.overdueTasks}</div>
          <div className="gestion-kpi-card-label">En retard</div>
        </div>
        <div className="gestion-kpi-card">
          <div className="gestion-kpi-card-value">
            {kpi.totalTasks > 0 ? Math.round((kpi.completedTasks / kpi.totalTasks) * 100) : 0}%
          </div>
          <div className="gestion-kpi-card-label">Taux completion</div>
        </div>
      </div>

      {/* Status & Priority bars */}
      <div className="gestion-kpi-grid">
        <div className="gestion-kpi-section">
          <h3>Par statut</h3>
          {Object.entries(kpi.tasksByStatus).map(([key, val]) => (
            <div key={key} className="gestion-kpi-bar-row">
              <span className="gestion-kpi-bar-label">{STATUS_LABELS[key] || key}</span>
              <div className="gestion-kpi-bar-track">
                <div
                  className="gestion-kpi-bar-fill"
                  style={{
                    width: kpi.totalTasks > 0 ? `${(val / kpi.totalTasks) * 100}%` : '0%',
                    background: key === 'TERMINE' ? '#22c55e' : key === 'EN_COURS' ? '#0ea5e9' : key === 'EN_REVIEW' ? '#f59e0b' : '#64748b',
                  }}
                />
              </div>
              <span className="gestion-kpi-bar-value">{val}</span>
            </div>
          ))}
        </div>
        <div className="gestion-kpi-section">
          <h3>Par priorite</h3>
          {Object.entries(kpi.tasksByPriority).map(([key, val]) => (
            <div key={key} className="gestion-kpi-bar-row">
              <span className="gestion-kpi-bar-label">{PRIORITY_LABELS[key] || key}</span>
              <div className="gestion-kpi-bar-track">
                <div
                  className="gestion-kpi-bar-fill"
                  style={{
                    width: kpi.totalTasks > 0 ? `${(val / kpi.totalTasks) * 100}%` : '0%',
                    background: key === 'URGENTE' ? '#ef4444' : key === 'HAUTE' ? '#f59e0b' : key === 'NORMALE' ? '#0ea5e9' : '#64748b',
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
          <h3>Performance par personne</h3>
          <div className="gestion-table-wrap">
            <table className="gestion-table">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Total</th>
                  <th>Terminees</th>
                  <th>En cours</th>
                  <th>En retard</th>
                  <th>Respect deadline</th>
                  <th>Duree moy.</th>
                </tr>
              </thead>
              <tbody>
                {kpi.tasksByPerson.map((p) => (
                  <tr key={p.userId}>
                    <td className="gestion-cell-title">{p.name}</td>
                    <td>{p.total}</td>
                    <td style={{ color: '#22c55e' }}>{p.completed}</td>
                    <td style={{ color: '#0ea5e9' }}>{p.inProgress}</td>
                    <td style={{ color: p.overdue > 0 ? '#ef4444' : 'inherit' }}>{p.overdue}</td>
                    <td>
                      {p.complianceRate !== null ? (
                        <span style={{ color: p.complianceRate >= 80 ? '#22c55e' : p.complianceRate >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {p.complianceRate}%
                        </span>
                      ) : '—'}
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
          <h3>Briefs de mission ({kpi.briefStats.totalBriefs} total)</h3>
          <div className="gestion-kpi-grid" style={{ border: 'none', padding: 0 }}>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>Attribues par (super admin)</h4>
              <div className="gestion-table-wrap">
                <table className="gestion-table">
                  <thead>
                    <tr>
                      <th>Super Admin</th>
                      <th>Briefs attribues</th>
                      <th>Valides</th>
                      <th>Livres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpi.briefStats.byCreator.map((c) => (
                      <tr key={c.userId}>
                        <td className="gestion-cell-title">{c.name}</td>
                        <td>{c.total}</td>
                        <td style={{ color: '#22c55e' }}>{c.byStatus.VALIDE || 0}</td>
                        <td style={{ color: '#8b5cf6' }}>{c.byStatus.LIVRE || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>Recus par (membres)</h4>
              <div className="gestion-table-wrap">
                <table className="gestion-table">
                  <thead>
                    <tr>
                      <th>Membre</th>
                      <th>Recus</th>
                      <th>Termines</th>
                      <th>Taux</th>
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
                            <span style={{ color: (d.completed / d.received) >= 0.8 ? '#22c55e' : '#f59e0b' }}>
                              {Math.round((d.completed / d.received) * 100)}%
                            </span>
                          ) : '—'}
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
