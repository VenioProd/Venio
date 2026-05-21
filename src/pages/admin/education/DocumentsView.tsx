import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderOpen, Upload, Link2, Search, RefreshCw, Trash2, Pencil, X,
  Download, ExternalLink, FileText, Tag as TagIcon, Filter,
} from 'lucide-react'
import {
  listDocuments, uploadDocument, createDocumentFromUrl, updateDocument, deleteDocument,
  documentDownloadUrl, formatFileSize, formatDate,
  DOCUMENT_CATEGORY_LABEL, DOCUMENT_STATUS_LABEL,
  type EducationDocument, type EducationDocumentCategory, type EducationDocumentStatus,
  type EducationClass, type ListDocumentsParams, type DocumentCreatePayload,
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

interface DocumentsViewProps {
  classes: EducationClass[]
}

export function DocumentsView({ classes }: DocumentsViewProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<EducationDocumentCategory | ''>('')
  const [status, setStatus] = useState<EducationDocumentStatus | ''>('')
  const [school, setSchool] = useState('')
  const [classId, setClassId] = useState('')
  const [tag, setTag] = useState('')
  const [items, setItems] = useState<EducationDocument[]>([])
  const [total, setTotal] = useState(0)
  const [categoryCounts, setCategoryCounts] = useState<Partial<Record<EducationDocumentCategory, number>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState<null | 'file' | 'url'>(null)
  const [editing, setEditing] = useState<EducationDocument | null>(null)

  const schools = useMemo(() => {
    const set = new Set<string>()
    classes.forEach((c) => { if (c.school) set.add(c.school) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [classes])

  const refresh = useCallback(async (overrides: Partial<ListDocumentsParams> = {}) => {
    setLoading(true)
    setError(null)
    try {
      const params: ListDocumentsParams = {
        search: search || undefined,
        category: (overrides.category !== undefined ? overrides.category : category) || undefined,
        status: status || undefined,
        school: school || undefined,
        classId: classId || undefined,
        tag: tag || undefined,
      }
      const r = await listDocuments(params)
      setItems(r.documents)
      setTotal(r.total)
      setCategoryCounts(r.categoryCounts || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les documents')
    } finally {
      setLoading(false)
    }
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
    if (!confirm('Supprimer ce document ? (suppression réversible côté base)')) return
    try {
      await deleteDocument(id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
    }
  }

  const handleOpen = (doc: EducationDocument) => {
    if (doc.url && !doc.storagePath) {
      window.open(doc.url, '_blank', 'noopener')
      return
    }
    window.open(documentDownloadUrl(doc._id), '_blank', 'noopener')
  }

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 className="edu-h1">Documents</h1>
          <p className="edu-sub">
            Base documentaire pédagogique. {total} document{total > 1 ? 's' : ''} indexé{total > 1 ? 's' : ''} sur cette vue.
          </p>
        </div>
        <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className="edu-btn ghost" onClick={() => refresh()} title="Rafraîchir">
            <RefreshCw size={14} /> Rafraîchir
          </button>
          <button className="edu-btn ghost" onClick={() => setShowCreate('url')}>
            <Link2 size={14} /> Ajouter une URL
          </button>
          <button className="edu-btn" onClick={() => setShowCreate('file')}>
            <Upload size={14} /> Importer un fichier
          </button>
        </div>
      </div>

      {/* Compteurs par catégorie (clic = filtre rapide) */}
      <div className="edu-doc-counters">
        <button
          type="button"
          className={`edu-doc-counter ${category === '' ? 'is-active' : ''}`}
          onClick={() => setCategory('')}
        >
          <span className="edu-doc-counter-value">{Object.values(categoryCounts).reduce((a, b) => a + (b || 0), 0)}</span>
          <span className="edu-doc-counter-label">Tous</span>
        </button>
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`edu-doc-counter ${category === cat ? 'is-active' : ''}`}
            onClick={() => setCategory(category === cat ? '' : cat)}
          >
            <span className="edu-doc-counter-value">{categoryCounts[cat] ?? 0}</span>
            <span className="edu-doc-counter-label">{DOCUMENT_CATEGORY_LABEL[cat]}</span>
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
            placeholder="Rechercher (titre, nom de fichier, description, tag)…"
          />
        </div>
        <select className="edu-select" value={status} onChange={(e) => setStatus(e.target.value as EducationDocumentStatus | '')}>
          <option value="">Tous statuts</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{DOCUMENT_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="edu-select" value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">Toutes écoles</option>
          {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="edu-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Toutes classes</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}{c.school ? ` · ${c.school}` : ''}
            </option>
          ))}
        </select>
        <input
          className="edu-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag exact (ex. examen)"
          style={{ maxWidth: 180 }}
        />
        {(search || category || status || school || classId || tag) && (
          <button className="edu-btn ghost" onClick={resetFilters} title="Réinitialiser les filtres">
            <Filter size={13} /> Réinitialiser
          </button>
        )}
      </div>

      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => refresh()}>Réessayer</button>
        </div>
      )}

      {/* Table dense */}
      {loading && items.length === 0 ? (
        <div className="edu-sub">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon"><FolderOpen size={20} /></div>
          <div>Aucun document pour ces critères.</div>
          <div className="edu-empty-sub">
            Importe un fichier (PDF, image, document) ou ajoute une URL pour démarrer la base documentaire.
          </div>
          <div className="edu-row" style={{ marginTop: 12, justifyContent: 'center' }}>
            <button className="edu-btn" onClick={() => setShowCreate('file')}><Upload size={13} /> Importer</button>
            <button className="edu-btn ghost" onClick={() => setShowCreate('url')}><Link2 size={13} /> URL</button>
          </div>
        </div>
      ) : (
        <div className="edu-doc-table-wrap">
          <table className="edu-table edu-doc-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Document</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>École / Classe</th>
                <th>Tags</th>
                <th>Date</th>
                <th>Taille</th>
                <th aria-label="Actions"></th>
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
                            {doc.title || doc.originalName || 'Sans titre'}
                          </div>
                          {doc.description && (
                            <div className="edu-doc-title-sub" title={doc.description}>{doc.description}</div>
                          )}
                          {!doc.description && doc.originalName && doc.title !== doc.originalName && (
                            <div className="edu-doc-title-sub" title={doc.originalName}>{doc.originalName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="edu-pill">{DOCUMENT_CATEGORY_LABEL[doc.category]}</span>
                    </td>
                    <td>
                      <span className={`edu-pill edu-doc-status edu-doc-status-${doc.status.toLowerCase()}`}>
                        {DOCUMENT_STATUS_LABEL[doc.status]}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        {doc.school || <span style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>}
                      </div>
                      {klass && (
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>
                          {klass.name}
                        </div>
                      )}
                    </td>
                    <td>
                      {doc.tags.length === 0 ? (
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>—</span>
                      ) : (
                        <div className="edu-doc-tags">
                          {doc.tags.slice(0, 3).map((t) => (
                            <span key={t} className="edu-doc-tag"><TagIcon size={10} /> {t}</span>
                          ))}
                          {doc.tags.length > 3 && (
                            <span className="edu-doc-tag-more">+{doc.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {formatDate(doc.documentDate || doc.updatedAt)}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {doc.url && !doc.storagePath ? <span title={doc.url}>URL</span> : formatFileSize(doc.size)}
                    </td>
                    <td>
                      <div className="edu-row" style={{ gap: 2, justifyContent: 'flex-end' }}>
                        <button className="edu-btn-icon" title="Ouvrir / Télécharger" onClick={() => handleOpen(doc)}>
                          {doc.url && !doc.storagePath ? <ExternalLink size={14} /> : <Download size={14} />}
                        </button>
                        <button className="edu-btn-icon" title="Modifier" onClick={() => setEditing(doc)}>
                          <Pencil size={14} />
                        </button>
                        <button className="edu-btn-icon" title="Supprimer" onClick={() => handleDelete(doc._id)}>
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
  mode, classes, schools, onClose, onCreated,
}: {
  mode: 'file' | 'url'
  classes: EducationClass[]
  schools: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [form, setForm] = useState<Required<Pick<DocumentCreatePayload, 'title' | 'description' | 'category' | 'status' | 'school' | 'classId'>> & { tags: string }>({
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
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      }
      if (mode === 'file') {
        if (!file) {
          setError('Sélectionne un fichier (max 25 Mo).')
          return
        }
        await uploadDocument(file, payload)
      } else {
        if (!url.trim()) {
          setError('URL requise.')
          return
        }
        await createDocumentFromUrl({ ...payload, url: url.trim() })
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {mode === 'file' ? 'Importer un fichier' : 'Ajouter une URL'}
          </h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          {mode === 'file' ? (
            <div className="edu-form-group">
              <label>Fichier (PDF, image, document — 25 Mo max)</label>
              <input
                type="file"
                className="edu-input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                  {file.name} · {formatFileSize(file.size)}
                </div>
              )}
            </div>
          ) : (
            <div className="edu-form-group">
              <label>URL du document</label>
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
            <label>Titre</label>
            <input
              className="edu-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={file?.name || 'Titre du document'}
            />
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Catégorie</label>
              <select
                className="edu-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EducationDocumentCategory })}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EducationDocumentStatus })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{DOCUMENT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>École</label>
              <input
                className="edu-input"
                list="edu-doc-schools-create"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
              <datalist id="edu-doc-schools-create">
                {schools.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="edu-form-group">
              <label>Classe (optionnel)</label>
              <select
                className="edu-select"
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-form-group">
            <label>Description</label>
            <textarea
              className="edu-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Contexte, consigne, notes internes…"
            />
          </div>

          <div className="edu-form-group">
            <label>Tags (séparés par des virgules)</label>
            <input
              className="edu-input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="ex. examen, BTS, 2025"
            />
          </div>

          {error && <div className="edu-banner-error" role="alert">{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="edu-btn" onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement…' : (mode === 'file' ? 'Importer' : 'Ajouter')}
          </button>
        </div>
      </div>
    </>
  )
}

/* ─── Drawer d'édition (metadata only) ──────────────────────────────────── */
function DocumentEditDrawer({
  document: doc, classes, schools, onClose, onSaved,
}: {
  document: EducationDocument
  classes: EducationClass[]
  schools: string[]
  onClose: () => void
  onSaved: () => void
}) {
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
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        documentDate: form.documentDate || null,
        dueDate: form.dueDate || null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Modifier le document</h2>
          <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-doc-edit-meta">
            <div><strong>Fichier :</strong> {doc.originalName || '—'}</div>
            <div><strong>Taille :</strong> {formatFileSize(doc.size)}</div>
            <div><strong>Type :</strong> {doc.mimeType || '—'}</div>
            <div><strong>Ajouté :</strong> {formatDate(doc.createdAt, true)}</div>
          </div>

          <div className="edu-form-group">
            <label>Titre</label>
            <input
              className="edu-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Catégorie</label>
              <select
                className="edu-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as EducationDocumentCategory })}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EducationDocumentStatus })}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{DOCUMENT_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>École</label>
              <input
                className="edu-input"
                list="edu-doc-schools-edit"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
              />
              <datalist id="edu-doc-schools-edit">
                {schools.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="edu-form-group">
              <label>Classe</label>
              <select
                className="edu-select"
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                <option value="">—</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}{c.school ? ` · ${c.school}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Date du document</label>
              <input
                type="date"
                className="edu-input"
                value={form.documentDate}
                onChange={(e) => setForm({ ...form, documentDate: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Échéance (optionnel)</label>
              <input
                type="date"
                className="edu-input"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="edu-form-group">
            <label>Description</label>
            <textarea
              className="edu-textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="edu-form-group">
            <label>Tags (séparés par des virgules)</label>
            <input
              className="edu-input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>

          <div className="edu-form-group">
            <label>URL externe (si document hébergé ailleurs)</label>
            <input
              className="edu-input"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
            />
          </div>

          {error && <div className="edu-banner-error" role="alert">{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="edu-btn" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}
