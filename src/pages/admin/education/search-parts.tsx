/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GraduationCap,
  BookOpen,
  Calendar as CalIcon,
  ClipboardList,
  FileText,
  Plus,
  Search,
  X,
  Trash2,
  Upload,
  ChevronRight,
  Menu,
  Sparkles,
  Download,
  Loader2,
} from 'lucide-react'
import { apiDownload } from '../../../lib/api'
import {
  fetchDashboard,
  listClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  listStudents,
  createStudent,
  importStudentsCsv,
  deleteStudent,
  listSessions,
  createSession,
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  updateSubmission,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTemplates,
  searchEducation,
  studentDisplayName,
  formatDate,
  assignmentExportUrl,
  documentDownloadUrl,
  CLASS_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_COLOR,
  ASSIGNMENT_KIND_LABEL,
  SUBMISSION_STATUS_LABEL,
  CLASS_COLOR_PALETTE,
  type EducationDashboard,
  type EducationClass,
  type EducationStudent,
  type EducationSession,
  type EducationAssignment,
  type EducationSubmission,
  type EducationNote,
  type NoteBlock,
  type EducationAssignmentStatus,
  type EducationTemplate,
  type EducationSearchDocument,
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

type PreviewKind = 'pdf' | 'image'

const PREVIEWABLE_MIME_TYPES: Record<string, PreviewKind> = {
  'application/pdf': 'pdf',
  'image/bmp': 'image',
  'image/gif': 'image',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
}

function previewKindForMimeType(mimeType: string | null | undefined): PreviewKind | null {
  return PREVIEWABLE_MIME_TYPES[mimeType?.split(';', 1)[0].trim().toLowerCase() ?? ''] ?? null
}

type DocumentPreviewState = {
  document: EducationSearchDocument
  kind: PreviewKind
  status: 'loading' | 'ready' | 'error'
  objectUrl?: string
}

function QuickfindDocumentPreview({
  preview,
  onClose,
  onDownload,
}: {
  preview: DocumentPreviewState
  onClose: () => void
  onDownload: (document: EducationSearchDocument) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const documentLabel = preview.document.title || preview.document.originalName || 'Document sans titre'

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const objectUrl = preview.objectUrl
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [preview.objectUrl])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="edu-drawer-backdrop" style={{ zIndex: 102 }} onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickfind-document-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          inset: '6vh 5vw',
          zIndex: 103,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#0E1116',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          boxShadow: '0 16px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h2
            id="quickfind-document-preview-title"
            style={{
              flex: 1,
              margin: 0,
              overflow: 'hidden',
              fontSize: 16,
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Aperçu : {documentLabel}
          </h2>
          <button
            type="button"
            className="edu-search-document-action"
            onClick={() => onDownload(preview.document)}
            aria-label={`Télécharger ${documentLabel}`}
          >
            <Download size={13} aria-hidden /> Télécharger
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className="edu-search-document-action"
            onClick={onClose}
            aria-label={`Fermer l’aperçu de ${documentLabel}`}
          >
            <X size={13} aria-hidden /> Fermer
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: preview.kind === 'pdf' ? '#1e293b' : '#090b0e',
          }}
        >
          {preview.status === 'loading' && (
            <div role="status" aria-live="polite" className="edu-empty">
              <Loader2 size={18} className="edu-spin" aria-hidden /> Chargement de l’aperçu…
            </div>
          )}
          {preview.status === 'error' && (
            <div role="alert" className="edu-banner-error" style={{ maxWidth: 520 }}>
              Impossible de charger l’aperçu du document. Vous pouvez le télécharger si vous y avez toujours accès.
            </div>
          )}
          {preview.status === 'ready' && preview.objectUrl && preview.kind === 'image' && (
            <img
              src={preview.objectUrl}
              alt={documentLabel}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          )}
          {preview.status === 'ready' && preview.objectUrl && preview.kind === 'pdf' && (
            <iframe
              src={preview.objectUrl}
              title={`Aperçu PDF : ${documentLabel}`}
              sandbox=""
              referrerPolicy="no-referrer"
              tabIndex={-1}
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function SearchModal({
  onClose,
  onPickClass,
  onPickSession,
  onPickAssignment,
  onPickStudent,
  onPickNote,
}: {
  onClose: () => void
  onPickClass: (id: string) => void
  onPickSession: (id: string) => void
  onPickAssignment: (id: string) => void
  onPickStudent: (id: string) => void
  onPickNote: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchEducation>>['results'] | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<DocumentPreviewState | null>(null)
  const previewRequestId = useRef(0)
  const previewAbortController = useRef<AbortController | null>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await searchEducation(q)
        if (!cancelled) setResults(r.results)
      } catch {
        /* silent */
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  function openDocumentContext(document: EducationSearchDocument) {
    const target = document.parentContext?.state === 'available' ? document.parentContext.target : null
    if (!target) return
    if (target.kind === 'class') onPickClass(target.id)
    if (target.kind === 'session') onPickSession(target.id)
    if (target.kind === 'assignment') onPickAssignment(target.id)
    if (target.kind === 'student') onPickStudent(target.id)
    if (target.kind === 'note') onPickNote(target.id)
  }

  async function downloadDocument(document: EducationSearchDocument) {
    setDownloadingId(document._id)
    setDownloadError(null)
    try {
      // La route vérifie à nouveau le propriétaire : Quickfind ne construit
      // jamais de lien direct vers le stockage du document.
      const { blob, filename } = await apiDownload(documentDownloadUrl(document._id))
      const href = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = href
      link.download = filename || document.originalName || document.title || 'document'
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur de téléchargement du document')
    } finally {
      setDownloadingId(null)
    }
  }

  async function previewDocument(document: EducationSearchDocument) {
    const kind = previewKindForMimeType(document.mimeType)
    if (!kind) return

    previewAbortController.current?.abort()
    const controller = new AbortController()
    previewAbortController.current = controller
    const requestId = ++previewRequestId.current
    setPreview({ document, kind, status: 'loading' })

    try {
      // Même route protégée que le téléchargement : aucun URL de stockage ne
      // transite vers le navigateur. Le MIME déclaré et le MIME reçu doivent
      // tous deux appartenir à la liste blanche de rendus inertes.
      const { blob, contentType } = await apiDownload(documentDownloadUrl(document._id), { signal: controller.signal })
      const responseMimeType = contentType.split(';', 1)[0].trim().toLowerCase()
      if (requestId !== previewRequestId.current || controller.signal.aborted) return
      if (
        responseMimeType !== document.mimeType.split(';', 1)[0].trim().toLowerCase() ||
        previewKindForMimeType(responseMimeType) !== kind
      ) {
        setPreview({ document, kind, status: 'error' })
        return
      }
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: responseMimeType }))
      setPreview({ document, kind, status: 'ready', objectUrl })
    } catch {
      if (requestId === previewRequestId.current && !controller.signal.aborted) {
        setPreview({ document, kind, status: 'error' })
      }
    }
  }

  function closePreview() {
    previewAbortController.current?.abort()
    previewAbortController.current = null
    previewRequestId.current += 1
    setPreview(null)
    requestAnimationFrame(() => previewTrigger.current?.focus())
  }

  useEffect(() => () => previewAbortController.current?.abort(), [])

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(640px, 92vw)',
          maxHeight: '70vh',
          overflow: 'auto',
          background: '#0E1116',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
          zIndex: 101,
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            className="edu-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher classes, étudiants, séances, devoirs, notes, documents…"
            style={{ fontSize: 14 }}
          />
        </div>
        <div className="edu-search-results" style={{ padding: '8px 12px' }}>
          {downloadError && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 8 }}>
              {downloadError}
            </div>
          )}
          {!results && q.trim().length < 2 && <div className="edu-empty">Tape au moins 2 caractères…</div>}
          {results && (
            <>
              {results.classes.length > 0 && <h4>Classes</h4>}
              {results.classes.map((c) => (
                <div key={c._id} className="edu-search-result" onClick={() => onPickClass(c._id)}>
                  <span
                    className="edu-pill-dot"
                    style={{ background: c.color, display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }}
                  />
                  {c.name}
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{c.school}</span>
                </div>
              ))}
              {results.students.length > 0 && <h4>Étudiants</h4>}
              {results.students.map((s) => (
                <div
                  key={s._id}
                  className="edu-search-result"
                  onClick={() => typeof s.classId !== 'string' && onPickClass(s.classId._id)}
                >
                  {studentDisplayName(s)}
                  {typeof s.classId !== 'string' && (
                    <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>· {s.classId.name}</span>
                  )}
                </div>
              ))}
              {results.sessions.length > 0 && <h4>Séances</h4>}
              {results.sessions.map((s) => (
                <div
                  key={s._id}
                  className="edu-search-result"
                  onClick={() => typeof s.classId !== 'string' && onPickClass(s.classId._id)}
                >
                  {s.title}
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>· {formatDate(s.date)}</span>
                </div>
              ))}
              {results.assignments.length > 0 && <h4>Devoirs</h4>}
              {results.assignments.map((a) => (
                <div
                  key={a._id}
                  className="edu-search-result"
                  onClick={() => typeof a.classId !== 'string' && onPickClass(a.classId._id)}
                >
                  {a.title}
                </div>
              ))}
              {results.notes.length > 0 && <h4>Notes</h4>}
              {results.notes.map((n) => (
                <div key={n._id} className="edu-search-result">
                  {n.title || 'Sans titre'}
                </div>
              ))}
              {results.documents.length > 0 && <h4>Documents</h4>}
              {results.documents.map((document) => {
                const target = document.parentContext?.state === 'available' ? document.parentContext.target : null
                const documentLabel = document.title || document.originalName || 'Document sans titre'
                const noParent =
                  document.parentContext?.state === 'unavailable' && document.parentContext.reason === 'NO_PARENT'
                const unavailableMessage = noParent
                  ? document.parentType === 'note'
                    ? ' · Aucune note parente associée'
                    : ' · Aucun contexte pédagogique associé'
                  : document.parentType === 'note'
                    ? ' · Note parente indisponible'
                    : ' · Contexte parent indisponible'
                return (
                  <div key={document._id} className="edu-search-result edu-search-document-result">
                    <div>
                      <FileText size={14} aria-hidden style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      {documentLabel}
                    </div>
                    <div className="edu-search-result-meta">
                      {target
                        ? ` · Ouvrir ${target.kind === 'assignment' ? 'le devoir' : target.kind === 'class' ? 'la classe' : target.kind === 'session' ? 'la séance' : target.kind === 'student' ? 'l’étudiant' : 'la note'} · ${target.label}${target.school ? ` · ${target.school}` : ''}`
                        : unavailableMessage}
                    </div>
                    <div
                      className="edu-search-document-actions"
                      role="group"
                      aria-label={`Actions pour ${documentLabel}`}
                    >
                      <button
                        type="button"
                        className="edu-search-document-action"
                        disabled={!target}
                        onClick={() => openDocumentContext(document)}
                        aria-label={`Ouvrir le contexte de ${documentLabel}`}
                      >
                        Ouvrir le contexte
                      </button>
                      {previewKindForMimeType(document.mimeType) ? (
                        <button
                          ref={(button) => {
                            if (button && preview?.document._id === document._id) previewTrigger.current = button
                          }}
                          type="button"
                          className="edu-search-document-action"
                          disabled={preview?.status === 'loading'}
                          onClick={(event) => {
                            previewTrigger.current = event.currentTarget
                            void previewDocument(document)
                          }}
                          aria-label={`Prévisualiser ${documentLabel}`}
                        >
                          {preview?.document._id === document._id && preview.status === 'loading' ? (
                            <Loader2 size={13} className="edu-spin" aria-hidden />
                          ) : (
                            <FileText size={13} aria-hidden />
                          )}
                          {preview?.document._id === document._id && preview.status === 'loading'
                            ? 'Chargement…'
                            : 'Prévisualiser'}
                        </button>
                      ) : (
                        <span className="edu-search-result-meta">
                          Aperçu indisponible pour ce format — téléchargez le fichier.
                        </span>
                      )}
                      <button
                        type="button"
                        className="edu-search-document-action"
                        disabled={downloadingId === document._id}
                        onClick={() => downloadDocument(document)}
                        aria-label={`Télécharger ${documentLabel}`}
                      >
                        {downloadingId === document._id ? (
                          <Loader2 size={13} className="edu-spin" aria-hidden />
                        ) : (
                          <Download size={13} aria-hidden />
                        )}
                        {downloadingId === document._id ? 'Téléchargement…' : 'Télécharger'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {Object.values(results).every((arr) => arr.length === 0) && q.trim().length >= 2 && (
                <div className="edu-empty">Aucun résultat pour « {q} »</div>
              )}
            </>
          )}
        </div>
      </div>
      {preview && (
        <QuickfindDocumentPreview
          preview={preview}
          onClose={closePreview}
          onDownload={(document) => void downloadDocument(document)}
        />
      )}
    </>
  )
}
