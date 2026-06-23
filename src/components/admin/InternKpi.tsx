import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { exportToCsv } from '../../lib/exportCsv'

interface InternKpiData {
  intern: {
    _id: string
    name: string
    email: string
    poste: string
    departement: string
    dateDebut: string
    dateFin: string
    tuteur: string | null
    ecole: string
    status: string
  }
  kpis: {
    totalReports: number
    validated: number
    pending: number
    drafts: number
    validationRate: number
    totalTaches: number
    totalAttachments: number
    lastActivity: string | null
    daysSinceLastReport: number | null
    regularite: number
    progress: number
    daysRemaining: number
    totalDays: number
    elapsedDays: number
  }
  weeks: { weekLabel: string; reports: number; taches: number; validated: number }[]
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

export default function InternKpi() {
  const navigate = useNavigate()
  const [data, setData] = useState<InternKpiData[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('ACTIF')
  const [expandedIntern, setExpandedIntern] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch<InternKpiData[]>(`/api/admin/interns/kpis?status=${filterStatus}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterStatus])

  // ── Export CSV ──
  const handleExportCsv = () => {
    const headers = [
      'Nom',
      'Email',
      'Poste',
      'Departement',
      'Ecole',
      'Tuteur',
      'Date debut',
      'Date fin',
      'Jours restants',
      'Progression',
      'Rapports total',
      'Valides',
      'En attente',
      'Brouillons',
      'Taux validation',
      'Taches realisees',
      'Fichiers joints',
      'Regularite (4 sem)',
      'Derniere activite',
      'Jours sans rapport',
    ]
    const rows = data.map((d) => [
      d.intern.name,
      d.intern.email,
      d.intern.poste,
      d.intern.departement,
      d.intern.ecole,
      d.intern.tuteur || '',
      fmtDate(d.intern.dateDebut),
      fmtDate(d.intern.dateFin),
      String(d.kpis.daysRemaining),
      `${d.kpis.progress}%`,
      String(d.kpis.totalReports),
      String(d.kpis.validated),
      String(d.kpis.pending),
      String(d.kpis.drafts),
      `${d.kpis.validationRate}%`,
      String(d.kpis.totalTaches),
      String(d.kpis.totalAttachments),
      `${d.kpis.regularite}%`,
      d.kpis.lastActivity ? fmtDate(d.kpis.lastActivity) : 'Aucune',
      d.kpis.daysSinceLastReport !== null ? String(d.kpis.daysSinceLastReport) : '—',
    ])
    const date = new Date().toISOString().split('T')[0]
    exportToCsv(`kpi-stagiaires-${date}.csv`, headers, rows)
  }

  // ── Export PDF ──
  const handleExportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const now = new Date().toLocaleDateString('fr-FR')
    let y = 20

    // Titre
    doc.setFontSize(18)
    doc.setTextColor(14, 165, 233)
    doc.text('KPI Stagiaires — Venio', 14, y)
    y += 10
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(
      `Genere le ${now} — Filtre : ${filterStatus === 'ACTIF' ? 'Actifs' : filterStatus === 'TERMINE' ? 'Termines' : 'Tous'}`,
      14,
      y,
    )
    y += 14

    // Resume global
    const totalInterns = data.length
    const avgValidation =
      totalInterns > 0 ? Math.round(data.reduce((s, d) => s + d.kpis.validationRate, 0) / totalInterns) : 0
    const avgRegularite =
      totalInterns > 0 ? Math.round(data.reduce((s, d) => s + d.kpis.regularite, 0) / totalInterns) : 0
    const totalReportsAll = data.reduce((s, d) => s + d.kpis.totalReports, 0)

    doc.setFontSize(13)
    doc.setTextColor(30)
    doc.text('Resume global', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.setTextColor(60)
    doc.text(`Stagiaires : ${totalInterns}`, 14, y)
    y += 6
    doc.text(`Rapports totaux : ${totalReportsAll}`, 14, y)
    y += 6
    doc.text(`Taux validation moyen : ${avgValidation}%`, 14, y)
    y += 6
    doc.text(`Regularite moyenne (4 sem) : ${avgRegularite}%`, 14, y)
    y += 14

    // Tableau par stagiaire
    data.forEach((d, idx) => {
      // Nouvelle page si besoin
      if (y > 240) {
        doc.addPage()
        y = 20
      }

      doc.setFontSize(12)
      doc.setTextColor(14, 165, 233)
      doc.text(`${idx + 1}. ${d.intern.name}`, 14, y)
      y += 7

      doc.setFontSize(9)
      doc.setTextColor(80)
      doc.text(`Poste : ${d.intern.poste}${d.intern.departement ? ' — ' + d.intern.departement : ''}`, 20, y)
      y += 5
      doc.text(
        `Stage : ${fmtDate(d.intern.dateDebut)} → ${fmtDate(d.intern.dateFin)} (${d.kpis.progress}%, ${d.kpis.daysRemaining}j restants)`,
        20,
        y,
      )
      y += 5
      if (d.intern.tuteur) {
        doc.text(`Tuteur : ${d.intern.tuteur}`, 20, y)
        y += 5
      }
      if (d.intern.ecole) {
        doc.text(`Ecole : ${d.intern.ecole}`, 20, y)
        y += 5
      }
      y += 2

      doc.setTextColor(40)
      doc.text(
        `Rapports : ${d.kpis.totalReports} total | ${d.kpis.validated} valides | ${d.kpis.pending} en attente | ${d.kpis.drafts} brouillons`,
        20,
        y,
      )
      y += 5
      doc.text(`Taux validation : ${d.kpis.validationRate}% | Regularite : ${d.kpis.regularite}%`, 20, y)
      y += 5
      doc.text(`Taches realisees : ${d.kpis.totalTaches} | Fichiers joints : ${d.kpis.totalAttachments}`, 20, y)
      y += 5
      doc.text(
        `Derniere activite : ${d.kpis.lastActivity ? fmtDate(d.kpis.lastActivity) : 'Aucune'}${d.kpis.daysSinceLastReport !== null ? ' (' + d.kpis.daysSinceLastReport + 'j)' : ''}`,
        20,
        y,
      )
      y += 5

      // Breakdown hebdo
      if (d.weeks.length > 0) {
        y += 2
        doc.setFontSize(9)
        doc.setTextColor(100)
        doc.text('Semaine          Rapports   Taches   Valides', 20, y)
        y += 5
        d.weeks.forEach((w) => {
          if (y > 275) {
            doc.addPage()
            y = 20
          }
          doc.setTextColor(60)
          doc.text(`${w.weekLabel}      ${w.reports}          ${w.taches}        ${w.validated}`, 20, y)
          y += 4.5
        })
      }

      y += 10
    })

    const date = new Date().toISOString().split('T')[0]
    doc.save(`kpi-stagiaires-${date}.pdf`)
  }

  if (loading)
    return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Chargement des KPIs...</p>

  // Stats globales
  const totalInterns = data.length
  const avgValidation =
    totalInterns > 0 ? Math.round(data.reduce((s, d) => s + d.kpis.validationRate, 0) / totalInterns) : 0
  const avgRegularite =
    totalInterns > 0 ? Math.round(data.reduce((s, d) => s + d.kpis.regularite, 0) / totalInterns) : 0
  const totalReportsAll = data.reduce((s, d) => s + d.kpis.totalReports, 0)
  const alertCount = data.filter((d) => d.kpis.daysSinceLastReport !== null && d.kpis.daysSinceLastReport > 3).length

  return (
    <div style={{ marginTop: 16 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {['ACTIF', 'TERMINE', ''].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: filterStatus === s ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                color: filterStatus === s ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'all 0.2s',
              }}
            >
              {s === 'ACTIF' ? 'Actifs' : s === 'TERMINE' ? 'Termines' : 'Tous'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleExportCsv}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              background: 'rgba(14, 165, 233, 0.08)',
              color: 'var(--primary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: 6, verticalAlign: -2 }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>
          <button
            onClick={handleExportPdf}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              background: 'rgba(14, 165, 233, 0.08)',
              color: 'var(--primary)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: 6, verticalAlign: -2 }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* Stats globales */}
      <div className="ticket-stats" style={{ marginBottom: 20 }}>
        <div className="ticket-stat-card">
          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 22 }}>{totalInterns}</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Stagiaires</span>
        </div>
        <div className="ticket-stat-card">
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 22 }}>{totalReportsAll}</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Rapports total</span>
        </div>
        <div className="ticket-stat-card">
          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 22 }}>{avgValidation}%</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Validation moy.</span>
        </div>
        <div className="ticket-stat-card">
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 22 }}>{avgRegularite}%</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Regularite moy.</span>
        </div>
        {alertCount > 0 && (
          <div className="ticket-stat-card" style={{ borderColor: '#ef4444' }}>
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 22 }}>{alertCount}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Alertes inactivite</span>
          </div>
        )}
      </div>

      {/* Graphique comparatif */}
      {data.length > 0 && (
        <div className="portal-card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 16,
            }}
          >
            Vue comparée
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.map((d) => {
              const colors = ['#0ea5e9', '#9b9b9b', '#ffffff', '#0284c7', '#6e6e6e', '#0ea5e9']
              const avatarColor = colors[d.intern.name.charCodeAt(0) % colors.length]
              const valColor =
                d.kpis.validationRate >= 80 ? '#22c55e' : d.kpis.validationRate >= 50 ? '#f59e0b' : '#ef4444'
              const regColor = d.kpis.regularite >= 70 ? '#22c55e' : d.kpis.regularite >= 40 ? '#f59e0b' : '#ef4444'
              return (
                <div
                  key={d.intern._id}
                  style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: avatarColor + '22',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: avatarColor,
                        fontWeight: 700,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {d.intern.name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      style={{
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: 12,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {d.intern.name.split(' ')[0]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {/* Validation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, width: 60, flexShrink: 0 }}>
                        Validation
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${d.kpis.validationRate}%`,
                            background: valColor,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                      <span style={{ color: valColor, fontSize: 11, fontWeight: 700, width: 32, textAlign: 'right' }}>
                        {d.kpis.validationRate}%
                      </span>
                    </div>
                    {/* Régularité */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, width: 60, flexShrink: 0 }}>
                        Régularité
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${d.kpis.regularite}%`,
                            background: regColor,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                      <span style={{ color: regColor, fontSize: 11, fontWeight: 700, width: 32, textAlign: 'right' }}>
                        {d.kpis.regularite}%
                      </span>
                    </div>
                    {/* Progression stage */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, width: 60, flexShrink: 0 }}>
                        Stage
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'rgba(255,255,255,0.06)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${d.kpis.progress}%`,
                            background: avatarColor,
                            borderRadius: 3,
                            opacity: 0.7,
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, width: 32, textAlign: 'right' }}>
                        {d.kpis.progress}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tableau KPI par stagiaire */}
      {data.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>
          Aucun stagiaire pour ce filtre
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {[
                  'Stagiaire',
                  'Poste',
                  'Rapports',
                  'Valides',
                  'Attente',
                  'Taux',
                  'Taches',
                  'Regularite',
                  'Dernier rapport',
                  'Progression',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 8px',
                      textAlign: 'left',
                      color: 'rgba(255,255,255,0.5)',
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => {
                const k = d.kpis
                const isExpanded = expandedIntern === d.intern._id
                const alertLevel =
                  k.daysSinceLastReport === null
                    ? 'none'
                    : k.daysSinceLastReport > 3
                      ? 'danger'
                      : k.daysSinceLastReport > 1
                        ? 'warning'
                        : 'ok'
                const colors = ['#0ea5e9', '#9b9b9b', '#ffffff', '#0284c7', '#6e6e6e', '#0ea5e9']
                const avatarColor = colors[d.intern.name.charCodeAt(0) % colors.length]

                return (
                  <tr
                    key={d.intern._id}
                    onClick={() => setExpandedIntern(isExpanded ? null : d.intern._id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: avatarColor + '22',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: avatarColor,
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {d.intern.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 600 }}>{d.intern.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{d.intern.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'rgba(255,255,255,0.7)' }}>{d.intern.poste}</td>
                    <td style={{ padding: '12px 8px', color: '#fff', fontWeight: 600 }}>{k.totalReports}</td>
                    <td style={{ padding: '12px 8px', color: '#22c55e', fontWeight: 600 }}>{k.validated}</td>
                    <td
                      style={{
                        padding: '12px 8px',
                        color: k.pending > 0 ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                        fontWeight: 600,
                      }}
                    >
                      {k.pending}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            (k.validationRate >= 80 ? '#22c55e' : k.validationRate >= 50 ? '#f59e0b' : '#ef4444') +
                            '22',
                          color: k.validationRate >= 80 ? '#22c55e' : k.validationRate >= 50 ? '#f59e0b' : '#ef4444',
                        }}
                      >
                        {k.validationRate}%
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'rgba(255,255,255,0.7)' }}>{k.totalTaches}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 40,
                            height: 4,
                            borderRadius: 2,
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${k.regularite}%`,
                              borderRadius: 2,
                              background: k.regularite >= 70 ? '#22c55e' : k.regularite >= 40 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            color: k.regularite >= 70 ? '#22c55e' : k.regularite >= 40 ? '#f59e0b' : '#ef4444',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {k.regularite}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {alertLevel === 'danger' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: '#ef444422',
                            color: '#ef4444',
                          }}
                        >
                          {k.daysSinceLastReport}j
                        </span>
                      )}
                      {alertLevel === 'warning' && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: '#f59e0b22',
                            color: '#f59e0b',
                          }}
                        >
                          {k.daysSinceLastReport}j
                        </span>
                      )}
                      {alertLevel === 'ok' && (
                        <span style={{ color: '#22c55e', fontSize: 12 }}>
                          {k.daysSinceLastReport === 0 ? 'Auj.' : `${k.daysSinceLastReport}j`}
                        </span>
                      )}
                      {alertLevel === 'none' && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 50,
                            height: 4,
                            borderRadius: 2,
                            background: 'rgba(255,255,255,0.06)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${k.progress}%`,
                              borderRadius: 2,
                              background:
                                k.progress >= 90 ? '#ef4444' : k.progress >= 70 ? '#f59e0b' : 'var(--primary)',
                            }}
                          />
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{k.progress}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Detail expanded — breakdown hebdo */}
          {expandedIntern &&
            (() => {
              const d = data.find((x) => x.intern._id === expandedIntern)
              if (!d) return null
              return (
                <div className="portal-card" style={{ marginTop: 8, marginBottom: 16 }}>
                  <div style={{ padding: '16px 20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: 14 }}>
                        Detail hebdomadaire — {d.intern.name}
                      </h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/admin/stagiaires/${d.intern._id}`)
                        }}
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: '1px solid rgba(14, 165, 233, 0.3)',
                          background: 'rgba(14, 165, 233, 0.08)',
                          color: 'var(--primary)',
                        }}
                      >
                        Voir fiche
                      </button>
                    </div>

                    {/* Infos rapides */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        Stage : {fmtDate(d.intern.dateDebut)} → {fmtDate(d.intern.dateFin)}
                      </span>
                      {d.intern.tuteur && (
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Tuteur : {d.intern.tuteur}</span>
                      )}
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                        Fichiers joints : {d.kpis.totalAttachments}
                      </span>
                    </div>

                    {/* Barres hebdomadaires */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      {d.weeks.map((w, i) => {
                        const maxReports = Math.max(1, ...d.weeks.map((wk) => wk.reports))
                        const barHeight = w.reports > 0 ? Math.max(20, (w.reports / maxReports) * 80) : 4
                        return (
                          <div
                            key={i}
                            style={{
                              textAlign: 'center',
                              padding: '12px 8px',
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.02)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'flex-end',
                                height: 80,
                                marginBottom: 8,
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: barHeight,
                                  borderRadius: '4px 4px 0 0',
                                  background:
                                    w.reports === 0
                                      ? 'rgba(255,255,255,0.06)'
                                      : w.validated === w.reports
                                        ? '#22c55e44'
                                        : 'rgba(14, 165, 233, 0.27)',
                                  border:
                                    w.reports > 0
                                      ? `1px solid ${w.validated === w.reports ? '#22c55e' : '#0ea5e9'}`
                                      : 'none',
                                  transition: 'height 0.3s',
                                }}
                              />
                            </div>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{w.reports}</div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>rapports</div>
                            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2 }}>
                              {w.taches} taches
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 4 }}>
                              {w.weekLabel}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}
        </div>
      )}
    </div>
  )
}
