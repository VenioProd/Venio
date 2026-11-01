import PageHeader from '../../components/admin/ui/PageHeader'
import { useState, useEffect, useRef } from 'react'
import { ApiError, apiDownload, apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import { formatDate } from '../../i18n/format'
import { translate, type MessageKey } from '../../i18n'
import ConfirmModal from '../../components/ConfirmModal'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Production.css'

// i18n-ignore: valeurs de catégorie stockées et envoyées à l'API, traduites à l'affichage via CATEGORY_LABEL_KEYS
const CATEGORIES = ['Présentation', 'Charte graphique', 'RH', 'Juridique', 'Commercial', 'Formation', 'Autre']

const CATEGORY_LABEL_KEYS: Record<string, MessageKey> = {
  Présentation: 'adminTech.resources.category.presentation',
  'Charte graphique': 'adminTech.resources.category.brandGuidelines',
  RH: 'adminTech.resources.category.hr',
  Juridique: 'adminTech.resources.category.legal',
  Commercial: 'adminTech.resources.category.sales',
  Formation: 'adminTech.resources.category.training',
  Autre: 'adminTech.resources.category.other',
}

// i18n-ignore: clés de catégorie (valeurs API), pas du texte affiché
const CAT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Présentation: {
    bg: 'color-mix(in srgb, var(--primary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--primary) 30%, transparent)',
    text: 'var(--primary)',
  },
  'Charte graphique': {
    bg: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)',
    text: 'var(--text-secondary)',
  },
  RH: {
    bg: 'color-mix(in srgb, var(--good) 12%, transparent)',
    border: 'color-mix(in srgb, var(--good) 30%, transparent)',
    text: 'var(--good)',
  },
  Juridique: {
    bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    text: 'var(--warning)',
  },
  Commercial: {
    bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    text: 'var(--warning)',
  },
  Formation: {
    bg: 'color-mix(in srgb, var(--primary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--primary) 30%, transparent)',
    text: 'var(--primary)',
  },
  Autre: {
    bg: 'color-mix(in srgb, var(--text-secondary) 12%, transparent)',
    border: 'color-mix(in srgb, var(--text-secondary) 30%, transparent)',
    text: 'var(--text-primary)',
  },
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
  if (bytes < 1024) return translate('adminTech.resources.sizeBytes', { value: bytes })
  if (bytes < 1024 * 1024) return translate('adminTech.resources.sizeKb', { value: (bytes / 1024).toFixed(0) })
  return translate('adminTech.resources.sizeMb', { value: (bytes / (1024 * 1024)).toFixed(1) })
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
  const { t } = useI18n()
  const categoryLabel = (category: string) =>
    CATEGORY_LABEL_KEYS[category] ? t(CATEGORY_LABEL_KEYS[category]) : category
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
    try {
      const { blob, filename } = await apiDownload(`/api/admin/resources/${r._id}/download`)
      const url = URL.createObjectURL(blob)
      if (inline) {
        setPreviewUrl(url)
        setPreviewMime(r.mimeType)
        setPreviewName(r.name)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = filename ?? r.originalName
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (err) {
      showToast(
        err instanceof ApiError ? t('adminTech.resources.openError') : t('adminTech.resources.networkError'),
        'error',
      )
    }
  }

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  useEffect(() => {
    if (!previewUrl) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewUrl])

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ resources: Resource[] }>('/api/admin/resources')
      setResources(data.resources || [])
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      showToast(t('adminTech.resources.fileRequired'), 'error')
      return
    }
    if (!form.name.trim()) {
      showToast(t('adminTech.resources.nameRequired'), 'error')
      return
    }

    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', form.name.trim())
    formData.append('description', form.description)
    formData.append('category', form.category)

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/admin/resources')
        xhr.withCredentials = true
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).error || t('adminTech.resources.genericError')))
            } catch {
              reject(new Error(t('adminTech.resources.uploadError')))
            }
          }
        }
        xhr.onerror = () => reject(new Error(t('adminTech.resources.networkError')))
        xhr.send(formData)
      })
      showToast(t('adminTech.resources.uploaded'), 'success')
      setShowForm(false)
      setForm({ name: '', description: '', category: 'Autre' })
      setFile(null)
      load()
    } catch (err: any) {
      showToast(err.message || t('adminTech.resources.uploadError'), 'error')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/api/admin/resources/${deleteTarget}`, { method: 'DELETE' })
      showToast(t('adminTech.resources.deleted'), 'success')
      setDeleteTarget(null)
      load()
    } catch (err: any) {
      showToast(err.message || t('adminTech.resources.genericError'), 'error')
    }
  }

  const filtered = resources.filter(
    (r) =>
      (filterCat === 'all' || r.category === filterCat) &&
      (search === '' ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.originalName.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div className="portal-container production-page production-list production-resources">
      <div className="portal-card production-intro">
        <div className="production-header">
          <PageHeader
            eyebrow={t('shell.navItem.resources')}
            title={t('adminTech.resources.title')}
            actions={
              isSuperAdmin && (
                <div className="admin-actions portal-actions-reveal">
                  <button className="portal-button portal-action-link" type="button" onClick={() => setShowForm(true)}>
                    <span className="portal-action-icon" aria-hidden>
                      <svg
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </span>
                    <span className="portal-action-label">{t('adminTech.resources.addFile')}</span>
                  </button>
                </div>
              )
            }
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <input
            className="portal-input"
            placeholder={t('adminTech.resources.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 200, fontSize: 13, padding: '6px 10px' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFilterCat('all')}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background:
                  filterCat === 'all' ? 'color-mix(in srgb, var(--text-primary) 10%, transparent)' : 'transparent',
                borderColor:
                  filterCat === 'all' ? 'color-mix(in srgb, var(--text-primary) 30%, transparent)' : 'var(--border)',
                color: filterCat === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {t('adminTech.resources.filterAll')}
            </button>
            {CATEGORIES.map((cat) => {
              const c = CAT_COLORS[cat] || CAT_COLORS['Autre']
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat === filterCat ? 'all' : cat)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 'var(--r-pill)',
                    border: '1px solid',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: filterCat === cat ? c.bg : 'transparent',
                    borderColor: filterCat === cat ? c.border : 'var(--border)',
                    color: filterCat === cat ? c.text : 'var(--text-secondary)',
                  }}
                >
                  {categoryLabel(cat)}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Upload form */}
      {showForm && isSuperAdmin && (
        <div className="portal-card" style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('adminTech.resources.addTitle')}</h2>
          <form onSubmit={handleUpload}>
            <div className="production-form-grid">
              <div>
                <label className="portal-label">{t('adminTech.resources.nameLabel')}</label>
                <input
                  className="portal-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t('adminTech.resources.namePlaceholder')}
                />
              </div>
              <div>
                <label className="portal-label">{t('adminTech.resources.categoryLabel')}</label>
                <select
                  className="portal-input"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">{t('adminTech.resources.descriptionLabel')}</label>
                <input
                  className="portal-input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t('adminTech.resources.descriptionPlaceholder')}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="portal-label">{t('adminTech.resources.fileLabel')}</label>
                <input
                  ref={fileRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setFile(f)
                      if (!form.name) setForm((prev) => ({ ...prev, name: f.name.replace(/\.[^/.]+$/, '') }))
                    }
                  }}
                />
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    padding: '20px',
                    border: '2px dashed',
                    borderColor: file ? 'var(--primary)' : 'var(--border)',
                    borderRadius: 'var(--r-md)',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: file ? 'color-mix(in srgb, var(--primary) 5%, transparent)' : 'transparent',
                    transition: 'all .15s',
                  }}
                >
                  {file ? (
                    <div>
                      <div style={{ fontSize: 24 }}>{fileIcon(file.type)}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginTop: 4 }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatSize(file.size)}</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 24 }}>📁</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                        {t('adminTech.resources.chooseFile')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {t('adminTech.resources.fileHint')}
                      </div>
                    </div>
                  )}
                </div>
                {uploading && (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 'var(--r-hair)',
                        background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: 'var(--r-hair)',
                          width: `${uploadProgress}%`,
                          background: 'var(--primary)',
                          transition: 'width .2s',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textAlign: 'center' }}>
                      {uploadProgress}%
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="portal-button" type="submit" disabled={uploading}>
                {uploading
                  ? t('adminTech.resources.uploading', { progress: uploadProgress })
                  : t('adminTech.resources.publish')}
              </button>
              <button
                className="portal-button secondary"
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setFile(null)
                  setForm({ name: '', description: '', category: 'Autre' })
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resources grid */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="portal-card">
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t('common.loading')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">📂</div>
              <p className="admin-empty-state-text">
                {resources.length === 0 ? t('adminTech.resources.emptyNone') : t('adminTech.resources.emptyNoResult')}
              </p>
            </div>
          </div>
        ) : (
          <div className="production-resource-grid">
            {filtered.map((r) => {
              const c = CAT_COLORS[r.category] || CAT_COLORS['Autre']
              return (
                <div key={r._id} className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 5%, transparent)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ fontSize: 32, flexShrink: 0, lineHeight: 1 }}>{fileIcon(r.mimeType)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: 'var(--text-primary)',
                            marginBottom: 4,
                            wordBreak: 'break-word',
                          }}
                        >
                          {r.name}
                        </div>
                        {r.description && (
                          <div
                            style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}
                          >
                            {r.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 'var(--r-md)',
                              background: c.bg,
                              border: `1px solid ${c.border}`,
                              color: c.text,
                            }}
                          >
                            {categoryLabel(r.category)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatSize(r.size)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {t('adminTech.resources.addedBy', {
                        name: r.uploadedBy?.name || '—',
                        date: formatDate(r.createdAt),
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(r.mimeType.startsWith('image/') || r.mimeType.includes('pdf')) && (
                        <button
                          className="admin-card-btn admin-card-btn--edit"
                          type="button"
                          onClick={() => openFile(r, true)}
                          style={{ fontSize: 12 }}
                        >
                          {t('adminTech.resources.preview')}
                        </button>
                      )}
                      <button
                        className="admin-card-btn admin-card-btn--edit"
                        type="button"
                        onClick={() => openFile(r, false)}
                        style={{ fontSize: 12 }}
                      >
                        {t('adminTech.resources.download')}
                      </button>
                      {isSuperAdmin && (
                        <button
                          className="admin-card-btn admin-card-btn--delete"
                          type="button"
                          onClick={() => setDeleteTarget(r._id)}
                          style={{ fontSize: 12 }}
                        >
                          {t('common.delete')}
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-scrim)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={closePreview}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              background: 'var(--bg-secondary)',
              flexShrink: 0,
            }}
          >
            <span
              className="production-preview-title"
              style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}
            >
              {previewName}
            </span>
            <button
              type="button"
              onClick={closePreview}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: 22,
                flexShrink: 0,
                minWidth: 44,
                minHeight: 44,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {previewMime.startsWith('image/') ? (
              <img
                src={previewUrl}
                alt={previewName}
                style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 'var(--r-sm)', objectFit: 'contain' }}
              />
            ) : (
              <iframe
                src={previewUrl}
                title={previewName}
                style={{
                  width: '100%',
                  height: '80vh',
                  border: 'none',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--text-primary)',
                }}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('adminTech.resources.deleteTitle')}
        message={t('adminTech.resources.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
