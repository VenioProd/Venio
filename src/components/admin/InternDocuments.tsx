import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { exportToCsv } from '../../lib/exportCsv'
import DocPreviewModal from '../DocPreviewModal'

interface DocItem {
  _id: string
  filename: string
  originalName: string
  mimetype: string
  size: number
  fileType: string
  reportId: string
  reportDate: string
  reportStatus: string
  uploadedAt: string
  user: { _id: string; name: string; email: string }
  intern: { userId: string; poste: string } | null
}

interface DocStats {
  total: number
  totalSize: number
  byType: Record<string, number>
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  image: { label: 'Image', color: '#22c55e', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  pdf: { label: 'PDF', color: '#ef4444', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  document: { label: 'Document', color: '#0ea5e9', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  tableur: { label: 'Tableur', color: '#22c55e', icon: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  presentation: { label: 'Presentation', color: '#f59e0b', icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' },
  video: { label: 'Video', color: '#8b5cf6', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  audio: { label: 'Audio', color: '#ec4899', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z' },
  archive: { label: 'Archive', color: '#64748b', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
  autre: { label: 'Autre', color: '#94a3b8', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

interface InternOption { _id: string; userId: { _id: string; name: string } }

export default function InternDocuments() {
  const [documents, setDocuments] = useState<DocItem[]>([])
  const [stats, setStats] = useState<DocStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterIntern, setFilterIntern] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const [viewMode, setViewMode] = useState<'liste' | 'grille'>('liste')
  const [interns, setInterns] = useState<InternOption[]>([])
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterIntern) params.set('internId', filterIntern)
      if (filterType !== 'all') params.set('type', filterType)
      if (sortBy !== 'date') params.set('sort', sortBy)
      const data = await apiFetch<{ documents: DocItem[]; stats: DocStats }>(`/api/admin/interns/documents?${params}`)
      setDocuments(data.documents)
      setStats(data.stats)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [filterIntern, filterType, sortBy])

  useEffect(() => { loadDocs() }, [loadDocs])

  useEffect(() => {
    apiFetch<any[]>('/api/admin/interns').then(setInterns).catch(() => {})
  }, [])

  const handleExportCsv = () => {
    const headers = ['Fichier', 'Type', 'Taille', 'Stagiaire', 'Date rapport', 'Statut rapport']
    const rows = documents.map((d) => [
      d.originalName, TYPE_CONFIG[d.fileType]?.label || d.fileType, fmtSize(d.size),
      d.user?.name || '—', fmtDate(d.reportDate), d.reportStatus,
    ])
    exportToCsv(`documents-stagiaires-${new Date().toISOString().split('T')[0]}.csv`, headers, rows)
  }

  // Grouper par date pour la vue liste
  const groupedByDate: Record<string, DocItem[]> = {}
  documents.forEach((d) => {
    const dateKey = new Date(d.reportDate).toISOString().split('T')[0]
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = []
    groupedByDate[dateKey].push(d)
  })
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div style={{ marginTop: 16 }}>
      {preview && <DocPreviewModal url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Filtre stagiaire */}
          <select value={filterIntern} onChange={(e) => setFilterIntern(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
            <option value="">Tous les stagiaires</option>
            {interns.filter((i: any) => i.status === 'ACTIF').map((i: any) => (
              <option key={i._id} value={i._id}>{i.userId?.name || '—'}</option>
            ))}
          </select>

          {/* Filtre type */}
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
            <option value="all">Tous les types</option>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>

          {/* Tri */}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
            <option value="date">Tri par date</option>
            <option value="name">Tri par nom</option>
            <option value="size">Tri par taille</option>
            <option value="type">Tri par type</option>
          </select>

          {/* Vue */}
          {(['liste', 'grille'] as const).map((v) => (
            <button key={v} onClick={() => setViewMode(v)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: viewMode === v ? '#0ea5e9' : 'rgba(255,255,255,0.06)',
              color: viewMode === v ? '#fff' : 'rgba(255,255,255,0.5)',
            }}>
              {v === 'liste' ? 'Liste' : 'Grille'}
            </button>
          ))}
        </div>

        <button onClick={handleExportCsv} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.08)', color: '#0ea5e9',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          CSV
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="ticket-stats" style={{ marginBottom: 20 }}>
          <div className="ticket-stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 22 }}>{stats.total}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Fichiers</span>
          </div>
          <div className="ticket-stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 22 }}>{fmtSize(stats.totalSize)}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Taille totale</span>
          </div>
          {Object.entries(stats.byType).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => {
            const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.autre
            return (
              <div key={type} className="ticket-stat-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ color: cfg.color, fontWeight: 700, fontSize: 22 }}>{count}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {documents.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun document</p>
      ) : viewMode === 'liste' ? (
        /* ── VUE LISTE groupee par date ── */
        <div>
          {sortBy === 'date' ? (
            sortedDates.map((dateKey) => (
              <div key={dateKey} style={{ marginBottom: 20 }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, paddingLeft: 4 }}>
                  {fmtDate(dateKey)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {groupedByDate[dateKey].map((doc) => <DocRow key={doc._id} doc={doc} onPreview={setPreview} />)}
                </div>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {documents.map((doc) => <DocRow key={doc._id} doc={doc} onPreview={setPreview} />)}
            </div>
          )}
        </div>
      ) : (
        /* ── VUE GRILLE ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {documents.map((doc) => {
            const cfg = TYPE_CONFIG[doc.fileType] || TYPE_CONFIG.autre
            const isImg = doc.fileType === 'image'
            return (
              <div key={doc._id} onClick={() => setPreview({ url: `/api/admin/interns/reports/files/${doc.filename}`, name: doc.originalName })}
                className="portal-card" style={{ cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.2s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = cfg.color)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
              >
                {/* Preview */}
                <div style={{ height: 100, background: isImg ? `url(/api/admin/interns/reports/files/${doc.filename}) center/cover` : cfg.color + '11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!isImg && (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={cfg.icon} />
                    </svg>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.originalName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: cfg.color, fontSize: 10, fontWeight: 600 }}>{cfg.label}</span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{fmtSize(doc.size)}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 4 }}>
                    {doc.user?.name} — {fmtDate(doc.reportDate)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, onPreview }: { doc: DocItem; onPreview: (p: { url: string; name: string }) => void }) {
  const cfg = TYPE_CONFIG[doc.fileType] || TYPE_CONFIG.autre
  return (
    <div onClick={() => onPreview({ url: `/api/admin/interns/reports/files/${doc.filename}`, name: doc.originalName })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        transition: 'background 0.15s, border-color 0.15s', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = cfg.color + '44' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)' }}
    >
      {/* Icone type */}
      <div style={{ width: 36, height: 36, borderRadius: 8, background: cfg.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={cfg.icon} />
        </svg>
      </div>

      {/* Nom fichier */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.originalName}</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
          {doc.user?.name} — {fmtDate(doc.reportDate)}
        </div>
      </div>

      {/* Badge type */}
      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: cfg.color + '18', color: cfg.color, flexShrink: 0 }}>
        {cfg.label}
      </span>

      {/* Taille */}
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, flexShrink: 0, minWidth: 55, textAlign: 'right' }}>{fmtSize(doc.size)}</span>
    </div>
  )
}
