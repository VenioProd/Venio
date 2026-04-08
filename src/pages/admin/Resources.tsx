import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, getToken } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const CATEGORIES = ['Présentation', 'Charte graphique', 'RH', 'Juridique', 'Commercial', 'Formation', 'Autre']

const CAT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Présentation':    { bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.3)',  text: '#38bdf8' },
  'Charte graphique':{ bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)',  text: '#c4b5fd' },
  'RH':              { bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.3)',  text: '#6ee7b7' },
  'Juridique':       { bg: 'rgba(234,179,8,0.12)',    border: 'rgba(234,179,8,0.3)',   text: '#fde047' },
  'Commercial':      { bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.3)',  text: '#fb923c' },
  'Formation':       { bg: 'rgba(236,72,153,0.12)',   border: 'rgba(236,72,153,0.3)',  text: '#f9a8d4' },
  'Autre':           { bg: 'rgba(100,116,180,0.12)',  border: 'rgba(100,116,180,0.3)', text: '#a5b4cf' },
}

function fileIcon(mime: string) {
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.includes('zip') || mime.includes('archive')) return '📦'
  return '📁'
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

interface Resource {
  _id: string
  name: string
  description: string
  category: string
  originalName: string
  mimeType: string
  size: number
  uploadedBy: { name: string }
  createdAt: string
}

export default function Resources() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const fileRef = useRef<HTMLInputElement>(null)

  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('all')
  const [search, setSearch] = useState('')

  // Upload form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category: 'Autre' })
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMime, setPreviewMime] = useState('')
  const [previewName, setPreviewName] = useState('')

  const openFile = async (r: Resource, inline: boolean) => {
    const token = getToken() || ''
    try {
      const resp = await fetch(`/api/admin/resources/${r._id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) { showToast('Impossible d\'ouvrir le fichier', 'error'); return }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      if (inline) {
        setPreviewUrl(url)
        setPreviewMime(r.mimeType)
        setPreviewName(r.name)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = r.originalName
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch { showToast('Erreur réseau', 'error') }
  }

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ resources: Resource[] }>('/api/admin/resources')
      setResources(data.resources || [])
    } catch { /* silent */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { showToast('Sélectionne un fichier', 'error'); return }
    if (!form.name.trim()) { showToast('Le nom est requis', 'error'); return }

    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', form.name.trim())
    formData.append('description', form.description)
    formData.append('category', form.category)

    try {
      const token = getToken() || ''
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/admin/resources')
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { resolve() }
          else { try { reject(new Error(JSON.parse(xhr.responseText).error || 'Erreur')) } catch { reject(new Error('Erreur upload')) } }
        }
        xhr.onerror = () => reject(new Error('Erreur réseau'))
        xhr.send(formData)
      })
      showToast('Fichier uploadé', 'success')
      setShowForm(false)
      setForm({ name: '', description: '', category: 'Autre' })
      setFile(null)
      load()
    } catch (err: any) {
      showToast(err.message || 'Erreur upload', 'error')
    } finally { setUploading(false); setUploadProgress(0) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/api/admin/resources/${deleteTarget}`, { method: 'DELETE' })
      showToast('Ressource supprimée', 'success')
      setDeleteTarget(null)
      load()
    } catch (err: any) { showToast(err.message || 'Erreur', 'error') }
  }

  const filtered = resources.filter(r =>
    (filterCat === 'all' || r.category === filterCat) &&
    (search === '' || r.name.toLowerCase().includes(search.toLowerCase()) || r.originalName.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Ressources</span>
        </div>
        <div className="admin-header">
          <h1>Ressources du groupe</h1>
          {isSuperAdmin && (
            <div className="admin-actions portal-actions-reveal">
              <button
                className="portal-button portal-action-link"
                type="button"
                onClick={() => setShowForm(true)}
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </span>
                <span className="portal-action-label">Ajouter un fichier</span>
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <input
            className="portal-input"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 200, fontSize: 13, padding: '6px 10px' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFilterCat('all')}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterCat === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent', borderColor: filterCat === 'all' ? 'rgba(255,255,255,0.3)' : 'var(--border)', color: filterCat === 'all' ? '#fff' : 'var(--text-secondary)' }}
            >Tous</button>
            {CATEGORIES.map(cat => {
              const c = CAT_COLORS[cat] || CAT_COLORS['Autre']
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat === filterCat ? 'all' : cat)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: filterCat === cat ? c.bg : 'transparent', borderColor: filterCat === cat ? c.border : 'var(--border)', color: filterCat === cat ? c.text : 'var(--text-secondary)' }}
                >{cat}</button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Upload form */}
      {showForm && isSuperAdmin && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Ajouter une ressource</h2>
          <form onSubmit={handleUpload}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="portal-label">Nom *</label>
                <input className="portal-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Présentation groupe Venio 2026" />
              </div>
              <div>
                <label className="portal-label">Catégorie</label>
                <select className="portal-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Description (optionnel)</label>
                <input className="portal-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brève description du document..." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">Fichier *</label>
                <input
                  ref={fileRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!form.name) setForm(prev => ({ ...prev, name: f.name.replace(/\.[^/.]+$/, '') })) } }}
                />
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: '20px', border: '2px dashed', borderColor: file ? '#0ea5e9' : 'var(--border)', borderRadius: 8, textAlign: 'center', cursor: 'pointer', background: file ? 'rgba(14,165,233,0.05)' : 'transparent', transition: 'all .15s' }}
                >
                  {file ? (
                    <div>
                      <div style={{ fontSize: 24 }}>{fileIcon(file.type)}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0ea5e9', marginTop: 4 }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatSize(file.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 24 }}>📁</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Clique pour choisir un fichier</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Tous formats acceptés · max 100 Mo</div>
                    </div>
                  )}
                </div>
                {uploading && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${uploadProgress}%`, background: '#0ea5e9', transition: 'width .2s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textAlign: 'center' }}>{uploadProgress}%</div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="portal-button" type="submit" disabled={uploading}>
                {uploading ? `Upload... ${uploadProgress}%` : 'Publier la ressource'}
              </button>
              <button className="portal-button secondary" type="button" onClick={() => { setShowForm(false); setFile(null); setForm({ name: '', description: '', category: 'Autre' }) }}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resources grid */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="portal-card"><p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Chargement...</p></div>
        ) : filtered.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">📂</div>
              <p className="admin-empty-state-text">{resources.length === 0 ? 'Aucune ressource pour l\'instant' : 'Aucun résultat'}</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map(r => {
              const c = CAT_COLORS[r.category] || CAT_COLORS['Autre']
              return (
                <div key={r._id} className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>{fileIcon(r.mimeType)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4, wordBreak: 'break-word' }}>{r.name}</div>
                        {r.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}>{r.description}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                            {r.category}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatSize(r.size)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      Ajouté par {r.uploadedBy?.name || '—'} · {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(r.mimeType.startsWith('image/') || r.mimeType.includes('pdf')) && (
                        <button
                          className="admin-card-btn admin-card-btn--edit"
                          type="button"
                          onClick={() => openFile(r, true)}
                          style={{ fontSize: 12 }}
                        >
                          Aperçu
                        </button>
                      )}
                      <button
                        className="admin-card-btn admin-card-btn--edit"
                        type="button"
                        onClick={() => openFile(r, false)}
                        style={{ fontSize: 12 }}
                      >
                        Télécharger
                      </button>
                      {isSuperAdmin && (
                        <button
                          className="admin-card-btn admin-card-btn--delete"
                          type="button"
                          onClick={() => setDeleteTarget(r._id)}
                          style={{ fontSize: 12 }}
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewUrl && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}
          onClick={closePreview}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(0,0,0,0.5)', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{previewName}</span>
            <button
              type="button"
              onClick={closePreview}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
            >✕</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => e.stopPropagation()}>
            {previewMime.startsWith('image/') ? (
              <img src={previewUrl} alt={previewName} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 4, objectFit: 'contain' }} />
            ) : (
              <iframe
                src={previewUrl}
                title={previewName}
                style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 4, background: '#fff' }}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Supprimer la ressource"
        message="Supprimer ce fichier ? Il sera supprimé du serveur définitivement."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
