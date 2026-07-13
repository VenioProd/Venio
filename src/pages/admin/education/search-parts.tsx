/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  GraduationCap, BookOpen, Calendar as CalIcon, ClipboardList, FileText,
  Plus, Search, X, Trash2, Upload, ChevronRight, Menu, Sparkles,
} from 'lucide-react'
import {
  fetchDashboard,
  listClasses, getClass, createClass, updateClass, deleteClass,
  listStudents, createStudent, importStudentsCsv, deleteStudent,
  listSessions, createSession,
  listAssignments, getAssignment, createAssignment, updateAssignment, updateSubmission,
  listNotes, createNote, updateNote, deleteNote,
  listTemplates,
  searchEducation,
  studentDisplayName, formatDate, assignmentExportUrl,
  CLASS_STATUS_LABEL, SESSION_STATUS_LABEL,
  ASSIGNMENT_STATUS_LABEL, ASSIGNMENT_STATUS_COLOR, ASSIGNMENT_KIND_LABEL,
  SUBMISSION_STATUS_LABEL,
  CLASS_COLOR_PALETTE,
  type EducationDashboard, type EducationClass, type EducationStudent,
  type EducationSession, type EducationAssignment, type EducationSubmission,
  type EducationNote, type NoteBlock,
  type EducationAssignmentStatus,
  type EducationTemplate,
  type EducationSearchDocument,
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

export function SearchModal({
  onClose,
  onPickClass,
  onPickSession,
  onPickAssignment,
  onPickStudent,
}: {
  onClose: () => void
  onPickClass: (id: string) => void
  onPickSession: (id: string) => void
  onPickAssignment: (id: string) => void
  onPickStudent: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchEducation>>['results'] | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await searchEducation(q)
        if (!cancelled) setResults(r.results)
      } catch { /* silent */ }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  function openDocumentContext(document: EducationSearchDocument) {
    const target = document.parentContext?.state === 'available' ? document.parentContext.target : null
    if (!target) return
    if (target.kind === 'class') onPickClass(target.id)
    if (target.kind === 'session') onPickSession(target.id)
    if (target.kind === 'assignment') onPickAssignment(target.id)
    if (target.kind === 'student') onPickStudent(target.id)
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div
        style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          width: 'min(640px, 92vw)', maxHeight: '70vh', overflow: 'auto',
          background: '#0E1116', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, boxShadow: '0 16px 64px rgba(0,0,0,0.5)', zIndex: 101,
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
          {!results && q.trim().length < 2 && (
            <div className="edu-empty">Tape au moins 2 caractères…</div>
          )}
          {results && (
            <>
              {results.classes.length > 0 && <h4>Classes</h4>}
              {results.classes.map((c) => (
                <div key={c._id} className="edu-search-result" onClick={() => onPickClass(c._id)}>
                  <span className="edu-pill-dot" style={{ background: c.color, display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
                  {c.name}
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{c.school}</span>
                </div>
              ))}
              {results.students.length > 0 && <h4>Étudiants</h4>}
              {results.students.map((s) => (
                <div key={s._id} className="edu-search-result" onClick={() => typeof s.classId !== 'string' && onPickClass(s.classId._id)}>
                  {studentDisplayName(s)}
                  {typeof s.classId !== 'string' && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>· {s.classId.name}</span>}
                </div>
              ))}
              {results.sessions.length > 0 && <h4>Séances</h4>}
              {results.sessions.map((s) => (
                <div key={s._id} className="edu-search-result" onClick={() => typeof s.classId !== 'string' && onPickClass(s.classId._id)}>
                  {s.title}
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>· {formatDate(s.date)}</span>
                </div>
              ))}
              {results.assignments.length > 0 && <h4>Devoirs</h4>}
              {results.assignments.map((a) => (
                <div key={a._id} className="edu-search-result" onClick={() => typeof a.classId !== 'string' && onPickClass(a.classId._id)}>
                  {a.title}
                </div>
              ))}
              {results.notes.length > 0 && <h4>Notes</h4>}
              {results.notes.map((n) => (
                <div key={n._id} className="edu-search-result">{n.title || 'Sans titre'}</div>
              ))}
              {results.documents.length > 0 && <h4>Documents</h4>}
              {results.documents.map((document) => {
                const target = document.parentContext?.state === 'available' ? document.parentContext.target : null
                const noParent =
                  document.parentContext?.state === 'unavailable' && document.parentContext.reason === 'NO_PARENT'
                return (
                  <button
                    key={document._id}
                    type="button"
                    className="edu-search-result edu-search-result-button"
                    disabled={!target}
                    onClick={() => openDocumentContext(document)}
                    aria-label={
                      target
                        ? `Ouvrir le contexte de ${document.title || document.originalName || 'ce document'}`
                        : undefined
                    }
                  >
                    <FileText size={14} aria-hidden style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    {document.title || document.originalName || 'Document sans titre'}
                    <span className="edu-search-result-meta">
                      {target
                        ? ` · Ouvrir ${target.kind === 'assignment' ? 'le devoir' : target.kind === 'class' ? 'la classe' : target.kind === 'session' ? 'la séance' : 'l’étudiant'} · ${target.label}${target.school ? ` · ${target.school}` : ''}`
                        : noParent
                          ? ' · Aucun contexte pédagogique associé'
                          : ' · Contexte parent indisponible'}
                    </span>
                  </button>
                )
              })}
              {Object.values(results).every((arr) => arr.length === 0) && q.trim().length >= 2 && (
                <div className="edu-empty">Aucun résultat pour « {q} »</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
