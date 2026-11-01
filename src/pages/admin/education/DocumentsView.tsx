import PageHeader from '../../../components/admin/ui/PageHeader'
import { apiDownload } from '../../../lib/api'
import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useI18n } from '../../../context/I18nContext'
import { intlLocale, translate, type MessageKey } from '../../../i18n'
import { formatFileSize, formatShortDate } from './eduFormat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen,
  Upload,
  Link2,
  Search,
  RefreshCw,
  Trash2,
  Pencil,
  X,
  Download,
  ExternalLink,
  FileText,
  Tag as TagIcon,
  Filter,
} from 'lucide-react'
import {
  listDocuments,
  uploadDocument,
  createDocumentFromUrl,
  updateDocument,
  deleteDocument,
  documentDownloadUrl,
  type EducationDocument,
  type EducationDocumentCategory,
  type EducationDocumentStatus,
  type EducationClass,
  type ListDocumentsParams,
  type DocumentCreatePayload,
} from '../../../services/education'

/**
 * VENIO-46 — Vue BDD documentaire pédagogique.
 *
 * - Filtres : catégorie, statut, école, classe, tag, recherche libre.
 * - Compteurs par catégorie côté serveur (toujours sur la base complète, pas
 *   sur le filtre courant, pour servir d'index).
 * - Création par upload de fichier OU saisie d'une URL.
 * - Édition metadata (titre/description/catégorie/statut/école/classe/tags…),
 *   ouverture/téléchargement, suppression soft.
 */

const CATEGORY_ORDER: EducationDocumentCategory[] = [
  'school_document',
  'exam_subject',
  'assignment_correction',
  'student_submission',
  'assignment_submission',
  'teaching_resource',
  'administrative',
  'other',
]

const STATUS_ORDER: EducationDocumentStatus[] = ['PUBLISHED', 'DRAFT', 'ARCHIVED']

const CATEGORY_LABEL_KEYS = {
  school_document: 'eduA.docs.category.schoolDocument',
  student_submission: 'eduA.docs.category.studentSubmission',
  assignment_submission: 'eduA.docs.category.assignmentSubmission',
  exam_subject: 'eduA.docs.category.examSubject',
  assignment_correction: 'eduA.docs.category.assignmentCorrection',
  teaching_resource: 'eduA.docs.category.teachingResource',
  administrative: 'eduA.docs.category.administrative',
  other: 'eduA.docs.category.other',
} as const satisfies Record<EducationDocumentCategory, MessageKey>

const STATUS_LABEL_KEYS = {
  DRAFT: 'eduA.docs.status.draft',
  PUBLISHED: 'eduA.docs.status.published',
  ARCHIVED: 'eduA.docs.status.archived',
} as const satisfies Record<EducationDocumentStatus, MessageKey>

interface DocumentsViewProps {
  classes: EducationClass[]
}

export function DocumentsView({ classes }: DocumentsViewProps) {
  const { t, locale } = useI18n()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EducationDocumentCategory | ''>('')
  const [status, setStatus] = useState<EducationDocumentStatus | ''>('')
  const [school, setSchool] = useState('')
  const [classId, setClassId] = useState('')
  const [tag, setTag] = useState('')
  const [items, setItems] = useState<EducationDocument[]>([])
  const requestId = useRef(0)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [categoryCounts, setCategoryCounts] = useState<Partial<Record<EducationDocumentCategory, number>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState<null | 'file' | 'url'>(null)
  const [editing, setEditing] = useState<EducationDocument | null>(null)

  const schools = useMemo(() => {
    const set = new Set<string>()
    classes.forEach((c) => {
      if (c.school) set.add(c.school)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, intlLocale(locale)))
  }, [classes, locale])

  const refresh = useCallback(
    async (overrides: Partial<ListDocumentsParams> = {}) => {
      const serial = ++requestId.current
      setLoading(true)
      setError(null)
      try {
        const params: ListDocumentsParams = {
          limit: 100,
          skip: page * 100,
          search: search || undefined,
          category: (overrides.category !== undefined ? overrides.category : category) || undefined,
          status: status || undefined,
          school: school || undefined,
          classId: classId || undefined,
          tag: tag || undefined,
        }
        const r = await listDocuments(params)
        if (serial !== requestId.current) return
        setItems(r.documents)
        setTotal(r.total)
        setCategoryCounts(r.categoryCounts || {})
      } catch (err) {
        if (serial === requestId.current)
          setError(err instanceof Error ? err.message : translate('eduA.docs.loadError'))
      } finally {
        if (serial === requestId.current) setLoading(false)
      }
    },
    [search, category, status, school, classId, tag, page],
  )

  useEffect(() => {
    setPage(0)
    requestId.current++
  }, [search, category, status, school, classId, tag])

  useEffect(() => {
    const timer = setTimeout(refresh, 200)
    return () => clearTimeout(timer)
  }, [refresh])

  const resetFilters = () => {
    setSearch('')
    setCategory('')
    setStatus('')
    setSchool('')
    setClassId('')
    setTag('')
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('eduA.docs.deleteConfirm'))) return
    try {
      await deleteDocument(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduA.common.deleteFailed'))
    }
  }

  const handleOpen = async (doc: EducationDocument) => {
    if (doc.url && !doc.storagePath) {
      window.open(doc.url, '_blank', 'noopener')
      return
    }
    try {
      const { blob, filename } = await apiDownload(documentDownloadUrl(doc._id))
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = filename || doc.originalName || doc.title || 'document'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduA.docs.downloadFailed'))
    }
  }

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <PageHeader
          eyebrow={t('adminOps.zone.education')}
          title={t('eduA.docs.title')}
          subtitle={<>{t('eduA.docs.subtitle', { count: total })}</>}
          actions={
            <>
              <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="edu-btn ghost" onClick={() => refresh()} title={t('eduA.docs.refresh')}>
                  <RefreshCw size={14} /> {t('eduA.docs.refresh')}
                </button>
                <button className="edu-btn ghost" onClick={() => setShowCreate('url')}>
                  <Link2 size={14} /> {t('eduA.docs.addUrl')}
                </button>
                <button className="edu-btn" onClick={() => setShowCreate('file')}>
                  <Upload size={14} /> {t('eduA.docs.importFile')}
                </button>
              </div>
            </>
          }
        />
      </div>

      {/* Compteurs par catégorie (clic = filtre rapide) */}
      <div className="edu-doc-counters">
        <button
          type="button"
          className={`edu-doc-counter ${category === '' ? 'is-active' : ''}`}
          onClick={() => setCategory('')}
        >
          <span className="edu-doc-counter-value">
            {Object.values(categoryCounts).reduce((a, b) => a + (b || 0), 0)}
          </span>
          <span className="edu-doc-counter-label">{t('eduA.docs.counterAll')}</span>
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`edu-doc-counter ${category === cat ? 'is-active' : ''}`}
            onClick={() => setCategory(category === cat ? '' : cat)}
          >
            <span className="edu-doc-counter-value">{categoryCounts[cat] ?? 0}</span>
            <span className="edu-doc-counter-label">{t(CATEGORY_LABEL_KEYS[cat])}</span>
          </button>
        ))}
      </div>

      {/* Barre de filtres */}
      <div className="edu-doc-filters">
        <div className="edu-doc-filter-search">
          <Search size={14} />
          <input
            className="edu-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('eduA.docs.searchPlaceholder')}
          />
        </div>
        <select
          className="edu-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as EducationDocumentStatus | '')}
        >
          <option value="">{t('eduA.docs.allStatuses')}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {t(STATUS_LABEL_KEYS[s])}
            </option>
          ))}
        </select>
        <select className="edu-select" value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">{t('eduA.docs.allSchools')}</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="edu-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t('eduA.docs.allClasses')}</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
              {c.school ? ` · ${c.school}` : ''}
            </option>
          ))}
        </select>
        <input
          className="edu-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder={t('eduA.docs.tagPlaceholder')}
          style={{ maxWidth: 180 }}
        />
        {(search || category || status || school || classId || tag) && (
          <button className="edu-btn ghost" onClick={resetFilters} title={t('eduA.docs.resetFilters')}>
            <Filter size={13} /> {t('eduA.docs.reset')}
          </button>
        )}
      </div>

      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => refresh()}>
            {t('eduA.common.retry')}
          </button>
        </div>
      )}

      {/* Table dense */}
      {loading && items.length === 0 ? (
        <div className="edu-sub">{t('eduA.docs.loading')}</div>
      ) : items.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">
            <FolderOpen size={20} />
          </div>
          <div>{t('eduA.docs.emptyTitle')}</div>
          <div className="edu-empty-sub">{t('eduA.docs.emptyText')}</div>
          <div className="edu-row" style={{ marginTop: 12, justifyContent: 'center' }}>
            <button className="edu-btn" onClick={() => setShowCreate('file')}>
              <Upload size={13} /> {t('eduA.docs.import')}
            </button>
            <button className="edu-btn ghost" onClick={() => setShowCreate('url')}>
              <Link2 size={13} /> {t('eduA.docs.urlShort')}
            </button>
          </div>
        </div>
      ) : (
        <div className="edu-doc-table-wrap">
          <table className="edu-table edu-doc-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>{t('eduA.docs.col.document')}</th>
                <th>{t('eduA.docs.field.category')}</th>
                <th>{t('eduA.docs.col.status')}</th>
                <th>{t('eduA.docs.col.schoolClass')}</th>
                <th>{t('eduA.docs.col.tags')}</th>
                <th>{t('eduA.docs.col.date')}</th>
                <th>{t('eduA.docs.col.size')}</th>
                <th aria-label={t('eduA.docs.col.actions')}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => {
                const klass = doc.classId ? classes.find((c) => c._id === doc.classId) : null
                return (
                  <tr key={doc._id}>
                    <td>
                      <div className="edu-doc-title-cell">
                        <FileText size={14} className="edu-doc-title-icon" aria-hidden />
                        <div style={{ minWidth: 0 }}>
                          <div className="edu-doc-title-main" title={doc.title || doc.originalName}>
                            {doc.title || doc.originalName || t('eduA.docs.untitled')}
                          </div>
                          {doc.description && (
                            <div className="edu-doc-title-sub" title={doc.description}>
                              {doc.description}
                            </div>
                          )}
                          {!doc.description && doc.originalName && doc.title !== doc.originalName && (
                            <div className="edu-doc-title-sub" title={doc.originalName}>
                              {doc.originalName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="edu-pill">{t(CATEGORY_LABEL_KEYS[doc.category])}</span>
                    </td>
                    <td>
                      <span className={`edu-pill edu-doc-status edu-doc-status-${doc.status.toLowerCase()}`}>
                        {t(STATUS_LABEL_KEYS[doc.status])}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        {doc.school || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </div>
                      {klass && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{klass.name}</div>}
                    </td>
                    <td>
                      {doc.tags.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div className="edu-doc-tags">
                          {doc.tags.slice(0, 3).map((t) => (
                            <span key={t} className="edu-doc-tag">
                              <TagIcon size={10} /> {t}
                            </span>
                          ))}
                          {doc.tags.length > 3 && <span className="edu-doc-tag-more">+{doc.tags.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{formatShortDate(doc.documentDate || doc.updatedAt)}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {doc.url && !doc.storagePath ? (
                        <span title={doc.url}>{t('eduA.docs.urlShort')}</span>
                      ) : (
                        formatFileSize(doc.size)
                      )}
                    </td>
                    <td>
                      <div className="edu-row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                        <button
                          className="edu-btn-icon"
                          title={t('eduA.docs.openDownload')}
                          onClick={() => handleOpen(doc)}
                        >
                          {doc.url && !doc.storagePath ? <ExternalLink size={14} /> : <Download size={14} />}
                        </button>
                        <button className="edu-btn-icon" title={t('common.edit')} onClick={() => setEditing(doc)}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="edu-btn-icon"
                          title={t('common.delete')}
                          onClick={() => handleDelete(doc._id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 100 && (
        <div className="edu-row" style={{ gap: 12, marginTop: 12 }}>
          <button
            className="edu-btn ghost"
            disabled={loading || page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            {t('common.previous')}
          </button>
          <span>{t('eduA.docs.pageOf', { page: page + 1, pages: Math.ceil(total / 100) })}</span>
          <button
            className="edu-btn ghost"
            disabled={loading || (page + 1) * 100 >= total}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('common.next')}
          </button>
        </div>
      )}
      {showCreate && (
        <DocumentCreateDrawer
          mode={showCreate}
          classes={classes}
          schools={schools}
          onClose={() => setShowCreate(null)}
          onCreated={async () => {
            setShowCreate(null)
            await refresh()
          }}
        />
      )}

      {editing && (
        <DocumentEditDrawer
          document={editing}
          classes={classes}
          schools={schools}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

/* ─── Drawer de création (file OU url) ──────────────────────────────────── */
function DocumentCreateDrawer({
  mode,
  classes,
  schools,
  onClose,
  onCreated,
}: {
  mode: 'file' | 'url'
  classes: EducationClass[]
  schools: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [form, setForm] = useState<
    Required<Pick<DocumentCreatePayload, 'title' | 'description' | 'category' | 'status' | 'school' | 'classId'>> & {
      tags: string
    }
  >({
    title: '',
    description: '',
    category: 'school_document',
    status: 'PUBLISHED',
    school: '',
    classId: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const payload: DocumentCreatePayload = {
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        category: form.category,
        status: form.status,
        school: form.school.trim() || undefined,
        classId: form.classId || undefined,
        tags: form.tags
          ? form.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      }
      if (mode === 'file') {
        if (!file) {
          setError(t('eduA.docs.fileRequired'))
          return
        }
        await uploadDocument(file, payload)
      } else {
        if (!url.trim()) {
          setError(t('eduA.docs.urlRequired'))
          return
        }
        await createDocumentFromUrl({ ...payload, url: url.trim() })
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduA.docs.createFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceOverlayPortal>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {mode === 'file' ? t('eduA.docs.importFile') : t('eduA.docs.addUrl')}
          </h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          {mode === 'file' ? (
            <div className="edu-form-group">
              <label>{t('eduA.docs.fileLabel')}</label>
              <input type="file" className="edu-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {file.name} · {formatFileSize(file.size)}
                </div>
              )}
            </div>
          ) : (
            <div className="edu-form-group">
              <label>{t('eduA.docs.urlLabel')}</label>
              <input
                className="edu-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                autoFocus
              />
            </div>
          )}

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.title')}</label>
            <input
              className="edu-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={file?.name || t('eduA.docs.titlePlaceholder')}
            />
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.category')}</label>
              <select
                className="edu-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EducationDocumentCategory })}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {t(CATEGORY_LABEL_KEYS[c])}
                  </option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>{t('eduA.docs.col.status')}</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EducationDocumentStatus })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_LABEL_KEYS[s])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.school')}</label>
              <input
                className="edu-input"
                list="edu-doc-schools-create"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
              <datalist id="edu-doc-schools-create">
                {schools.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.classOptional')}</label>
              <select
                className="edu-select"
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.school ? ` · ${c.school}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.description')}</label>
            <textarea
              className="edu-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('eduA.docs.descriptionPlaceholder')}
            />
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.tags')}</label>
            <input
              className="edu-input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder={t('eduA.docs.tagsPlaceholder')}
            />
          </div>

          {error && (
            <div className="edu-banner-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button className="edu-btn" onClick={submit} disabled={saving}>
            {saving ? t('eduA.common.saving') : mode === 'file' ? t('eduA.docs.import') : t('common.add')}
          </button>
        </div>
      </div>
    </WorkspaceOverlayPortal>
  )
}

/* ─── Drawer d'édition (metadata only) ──────────────────────────────────── */
function DocumentEditDrawer({
  document: doc,
  classes,
  schools,
  onClose,
  onSaved,
}: {
  document: EducationDocument
  classes: EducationClass[]
  schools: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const [form, setForm] = useState({
    title: doc.title,
    description: doc.description,
    category: doc.category,
    status: doc.status,
    school: doc.school,
    classId: doc.classId ?? '',
    url: doc.url,
    tags: doc.tags.join(', '),
    documentDate: doc.documentDate ? doc.documentDate.slice(0, 10) : '',
    dueDate: doc.dueDate ? doc.dueDate.slice(0, 10) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateDocument(doc._id, {
        title: form.title,
        description: form.description,
        category: form.category,
        status: form.status,
        school: form.school,
        classId: form.classId || null,
        url: form.url,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        documentDate: form.documentDate || null,
        dueDate: form.dueDate || null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduA.docs.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <WorkspaceOverlayPortal>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {t('eduA.docs.editTitle')}
          </h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-doc-edit-meta">
            <div>
              <strong>{t('eduA.docs.meta.file')}</strong> {doc.originalName || '—'}
            </div>
            <div>
              <strong>{t('eduA.docs.meta.size')}</strong> {formatFileSize(doc.size)}
            </div>
            <div>
              <strong>{t('eduA.docs.meta.type')}</strong> {doc.mimeType || '—'}
            </div>
            <div>
              <strong>{t('eduA.docs.meta.added')}</strong> {formatShortDate(doc.createdAt, true)}
            </div>
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.title')}</label>
            <input
              className="edu-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.category')}</label>
              <select
                className="edu-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EducationDocumentCategory })}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {t(CATEGORY_LABEL_KEYS[c])}
                  </option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>{t('eduA.docs.col.status')}</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EducationDocumentStatus })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_LABEL_KEYS[s])}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.school')}</label>
              <input
                className="edu-input"
                list="edu-doc-schools-edit"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
              <datalist id="edu-doc-schools-edit">
                {schools.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.class')}</label>
              <select
                className="edu-select"
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.school ? ` · ${c.school}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.documentDate')}</label>
              <input
                type="date"
                className="edu-input"
                value={form.documentDate}
                onChange={(e) => setForm({ ...form, documentDate: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>{t('eduA.docs.field.dueDateOptional')}</label>
              <input
                type="date"
                className="edu-input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.description')}</label>
            <textarea
              className="edu-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.tags')}</label>
            <input
              className="edu-input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>

          <div className="edu-form-group">
            <label>{t('eduA.docs.field.externalUrl')}</label>
            <input
              className="edu-input"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
            />
          </div>

          {error && (
            <div className="edu-banner-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button className="edu-btn" onClick={save} disabled={saving}>
            {saving ? t('eduA.common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </WorkspaceOverlayPortal>
  )
}
