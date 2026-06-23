import type { ActivityReport } from './types'
import { formatDate, REPORT_STATUS_CONFIG } from './types'
import ReportBody from './ReportBody'

interface Props {
  reports: ActivityReport[]
  reportView: 'liste' | 'kanban'
  setReportView: (v: 'liste' | 'kanban') => void
  expandedReport: string | null
  setExpandedReport: (v: string | null) => void
  draggedReportId: string | null
  setDraggedReportId: (v: string | null) => void
  dragOverCol: string | null
  setDragOverCol: (v: string | null) => void
  expandedIntern: string | null
  setExpandedIntern: (v: string | null) => void
  isAdmin: boolean
  handleValidateReport: (id: string, status: string) => void
  handleDeleteReport: (id: string) => void
  setCommentText: (v: string) => void
  setCommentModal: (v: { reportId: string; status: string } | null) => void
}

export default function ReportsTab({
  reports,
  reportView,
  setReportView,
  expandedReport,
  setExpandedReport,
  draggedReportId,
  setDraggedReportId,
  dragOverCol,
  setDragOverCol,
  expandedIntern,
  setExpandedIntern,
  isAdmin,
  handleValidateReport,
  handleDeleteReport,
  setCommentText,
  setCommentModal,
}: Props) {
  // Regrouper les rapports par personne
  const grouped: Record<string, { name: string; reports: ActivityReport[] }> = {}
  reports.forEach((r) => {
    const uid = r.userId?._id || 'unknown'
    if (!grouped[uid]) grouped[uid] = { name: r.userId?.name || 'Inconnu', reports: [] }
    grouped[uid].reports.push(r)
  })
  const people = Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name))
  const colors = ['#ccff00', '#9b9b9b', '#22c55e', '#f59e0b', '#ef4444', '#ffffff']
  const getColor = (name: string) => colors[name.charCodeAt(0) % colors.length]
  const kanbanCols: { key: string; label: string; color: string }[] = [
    { key: 'BROUILLON', label: 'Brouillon', color: '#a5b4cf' },
    { key: 'SOUMIS', label: 'Soumis', color: '#ccff00' },
    { key: 'EN_COURS_DE_REVUE', label: 'En revue', color: '#f59e0b' },
    { key: 'VALIDE', label: 'Validé', color: '#22c55e' },
    { key: 'REJETE', label: 'Rejeté', color: '#ef4444' },
  ]
  return (
    <>
      {/* Toggle vue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 20 }}>
        <button
          onClick={() => setReportView('liste')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            background: reportView === 'liste' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
            color: reportView === 'liste' ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.2s',
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
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          Liste
        </button>
        <button
          onClick={() => setReportView('kanban')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            background: reportView === 'kanban' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
            color: reportView === 'kanban' ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.2s',
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
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="10" y="3" width="5" height="12" rx="1" />
            <rect x="17" y="3" width="5" height="15" rx="1" />
          </svg>
          Kanban
        </button>
      </div>

      {reports.length === 0 && (
        <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun rapport d'activite</p>
      )}

      {/* ── VUE LISTE (par personne) ── */}
      {reportView === 'liste' && (
        <div className="ticket-list">
          {people.map(([uid, { name, reports: personReports }]) => {
            const validated = personReports.filter((r) => r.status === 'VALIDE').length
            const total = personReports.length
            const isPersonExpanded = expandedIntern === `reports-${uid}`
            const color = getColor(name)

            return (
              <div key={uid} style={{ marginBottom: 16 }}>
                <div
                  className="ticket-card"
                  style={{ borderLeft: `3px solid ${color}`, cursor: 'pointer' }}
                  onClick={() => setExpandedIntern(isPersonExpanded ? null : `reports-${uid}`)}
                >
                  <div className="ticket-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: color + '22',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                          {total} rapport{total > 1 ? 's' : ''} — {validated} valide{validated > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        color: 'rgba(255,255,255,0.3)',
                        transform: isPersonExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    >
                      ▼
                    </span>
                  </div>
                </div>

                {isPersonExpanded && (
                  <div style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {personReports.map((report) => {
                      const expanded = expandedReport === report._id
                      const sCfg = REPORT_STATUS_CONFIG[report.status]
                      return (
                        <div key={report._id} className="ticket-card" style={{ borderLeft: `3px solid ${sCfg.color}` }}>
                          <div
                            className="ticket-card-header"
                            onClick={() => setExpandedReport(expanded ? null : report._id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                              <span style={{ color: '#fff', fontWeight: 600 }}>{formatDate(report.date)}</span>
                              {report.taches.length > 0 && (
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                                  {report.taches.length} tache(s)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {report.attachments.length > 0 && (
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                                  📎 {report.attachments.length}
                                </span>
                              )}
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: sCfg.color + '22',
                                  color: sCfg.color,
                                }}
                              >
                                {sCfg.label}
                              </span>
                              <span
                                style={{
                                  color: 'rgba(255,255,255,0.3)',
                                  transform: expanded ? 'rotate(180deg)' : 'none',
                                  transition: 'transform 0.2s',
                                }}
                              >
                                ▼
                              </span>
                            </div>
                          </div>
                          {expanded && (
                            <ReportBody
                              report={report}
                              showAdminActions={true}
                              isAdmin={isAdmin}
                              onValidate={handleValidateReport}
                              onOpenComment={(rid, st, current) => {
                                setCommentText(current)
                                setCommentModal({ reportId: rid, status: st })
                              }}
                              onDelete={handleDeleteReport}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── VUE KANBAN (par statut) ── */}
      {reportView === 'kanban' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 20,
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          {kanbanCols.map((col) => {
            const colReports = reports.filter((r) => r.status === col.key)
            return (
              <div
                key={col.key}
                style={{
                  background: dragOverCol === col.key ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                  borderRadius: 10,
                  border: dragOverCol === col.key ? `1px solid ${col.color}44` : '1px solid rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverCol(col.key)
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={async (e) => {
                  e.preventDefault()
                  setDragOverCol(null)
                  if (draggedReportId) {
                    const report = reports.find((r) => r._id === draggedReportId)
                    if (report && report.status !== col.key) {
                      await handleValidateReport(draggedReportId, col.key)
                    }
                    setDraggedReportId(null)
                  }
                }}
              >
                {/* Header colonne */}
                <div
                  style={{
                    padding: '14px 16px',
                    borderBottom: '2px solid ' + col.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span
                    style={{
                      color: col.color,
                      fontWeight: 700,
                      fontSize: 13,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {col.label}
                  </span>
                  <span
                    style={{
                      background: col.color + '22',
                      color: col.color,
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {colReports.length}
                  </span>
                </div>

                {/* Cartes */}
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}>
                  {colReports.length === 0 && (
                    <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                      Aucun rapport
                    </p>
                  )}
                  {colReports.map((report) => {
                    const expanded = expandedReport === report._id
                    const color = getColor(report.userId?.name || '')
                    return (
                      <div
                        key={report._id}
                        draggable
                        onDragStart={() => setDraggedReportId(report._id)}
                        onDragEnd={() => {
                          setDraggedReportId(null)
                          setDragOverCol(null)
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'grab',
                          transition: 'border-color 0.2s, opacity 0.2s',
                          opacity: draggedReportId === report._id ? 0.5 : 1,
                        }}
                        onClick={() => setExpandedReport(expanded ? null : report._id)}
                      >
                        <div style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: '50%',
                                background: color + '22',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color,
                                fontWeight: 700,
                                fontSize: 12,
                                flexShrink: 0,
                              }}
                            >
                              {(report.userId?.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span
                              style={{
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 14,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {report.userId?.name || 'Inconnu'}
                            </span>
                          </div>
                          <p
                            style={{
                              color: 'rgba(255,255,255,0.6)',
                              fontSize: 12,
                              margin: '0 0 10px',
                              lineHeight: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical' as any,
                              overflow: 'hidden',
                            }}
                          >
                            {report.contenu}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                              {formatDate(report.date)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {report.attachments.length > 0 && (
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                                  📎 {report.attachments.length}
                                </span>
                              )}
                              {report.taches.length > 0 && (
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                                  {report.taches.length} tache(s)
                                </span>
                              )}
                            </div>
                          </div>
                          {report.commentaireAdmin && (
                            <div
                              style={{
                                marginTop: 6,
                                padding: '4px 8px',
                                borderRadius: 4,
                                background: 'rgba(204, 255, 0, 0.08)',
                                borderLeft: '2px solid var(--primary)',
                              }}
                            >
                              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                                {report.commentaireAdmin.length > 60
                                  ? report.commentaireAdmin.slice(0, 60) + '...'
                                  : report.commentaireAdmin}
                              </span>
                            </div>
                          )}
                        </div>
                        {expanded && (
                          <ReportBody
                            report={report}
                            showAdminActions={true}
                            isAdmin={isAdmin}
                            onValidate={handleValidateReport}
                            onOpenComment={(rid, st, current) => {
                              setCommentText(current)
                              setCommentModal({ reportId: rid, status: st })
                            }}
                            onDelete={handleDeleteReport}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
