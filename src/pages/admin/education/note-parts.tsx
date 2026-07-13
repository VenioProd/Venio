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
  listNotes, createNote, updateNote, deleteNote, getNote,
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
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

export function NotesTab({ classId, templates, onTemplatesChanged }: { classId: string; templates?: EducationTemplate[]; onTemplatesChanged?: () => void }) {
  return <NotesView classes={[]} fixedLink={{ type: 'class', refId: classId }} templates={templates} onTemplatesChanged={onTemplatesChanged} />
}

/* ─── Notes view ───────────────────────────────────────────────────────── */


export function NotesView({
  classes,
  fixedLink,
  templates,
  onTemplatesChanged: _onTemplatesChanged,
  incomingOpenId,
  onCloseIncomingOpen,
}: {
  classes: EducationClass[]
  fixedLink?: { type: 'class' | 'session' | 'assignment' | 'student'; refId: string }
  templates?: EducationTemplate[]
  onTemplatesChanged?: () => void
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
}) {
  const [notes, setNotes] = useState<EducationNote[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeNote, setActiveNote] = useState<EducationNote | null>(null)
  const [savingTimer, setSavingTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [saveState, setSaveState] = useState<NoteSaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await listNotes(fixedLink ? { linkType: fixedLink.type, linkId: fixedLink.refId } : {})
      setNotes(r.notes)
      setLoadError(null)
      if (!activeId && r.notes.length > 0) {
        setActiveId(r.notes[0]._id)
        setActiveNote(r.notes[0])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les notes')
    }
  }, [fixedLink, activeId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!activeId) { setActiveNote(null); return }
    const found = notes.find((n) => n._id === activeId)
    if (found) setActiveNote(found)
  }, [activeId, notes])

  useEffect(() => {
    if (!incomingOpenId) return
    let cancelled = false
    void (async () => {
      try {
        const { note } = await getNote(incomingOpenId)
        if (cancelled) return
        setNotes((current) => current.some((item) => item._id === note._id) ? current : [note, ...current])
        setActiveId(note._id)
        setActiveNote(note)
        setLoadError(null)
      } catch {
        if (!cancelled) setLoadError('La note demandée n’est plus accessible.')
      } finally {
        if (!cancelled) onCloseIncomingOpen?.()
      }
    })()
    return () => { cancelled = true }
  }, [incomingOpenId, onCloseIncomingOpen])

  const persist = useCallback((next: EducationNote) => {
    setActiveNote(next)
    if (savingTimer) clearTimeout(savingTimer)
    setSaveState('saving')
    setErrorMessage(null)
    const t = setTimeout(async () => {
      try {
        await updateNote(next._id, { title: next.title, blocks: next.blocks, pinned: next.pinned, archived: next.archived })
        setSaveState('saved')
        // Rafraîchir en arrière-plan sans écraser le contenu actif déjà à jour.
        const r = await listNotes(fixedLink ? { linkType: fixedLink.type, linkId: fixedLink.refId } : {})
        setNotes(r.notes)
        // Retour idle après 1.5s pour ne pas polluer l'UI.
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      } catch (err) {
        setSaveState('error')
        setErrorMessage(err instanceof Error ? err.message : 'Erreur de sauvegarde de la note')
      }
    }, 600)
    setSavingTimer(t)
  }, [savingTimer, fixedLink])

  async function newNote() {
    try {
      const r = await createNote({
        title: 'Nouvelle note',
        blocks: [{ id: makeBlockId(), type: 'paragraph', text: '', checked: false, level: 1, meta: {} }],
        links: fixedLink ? [fixedLink] : [],
      })
      await refresh()
      setActiveId(r.note._id)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Impossible de créer la note')
    }
  }

  return (
    <div>
      {!fixedLink && (
        <div className="edu-row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h1 className="edu-h1" style={{ margin: 0 }}>Notes</h1>
          <div className="edu-row" style={{ gap: 8 }}>
            <NoteSaveIndicator state={saveState} />
            <button className="edu-btn" onClick={newNote}><Plus size={14} /> Nouvelle note</button>
          </div>
        </div>
      )}
      {fixedLink && (
        <div className="edu-row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <strong>{notes.length} note{notes.length > 1 ? 's' : ''}</strong>
          <div className="edu-row" style={{ gap: 8 }}>
            <NoteSaveIndicator state={saveState} />
            <button className="edu-btn" onClick={newNote}><Plus size={14} /> Nouvelle note</button>
          </div>
        </div>
      )}
      {(errorMessage || loadError) && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {errorMessage || loadError}
          <button
            className="edu-btn ghost"
            style={{ marginLeft: 12 }}
            onClick={() => { setErrorMessage(null); setLoadError(null); refresh() }}
          >
            Réessayer
          </button>
        </div>
      )}
      <div className="edu-notes-layout">
        <div className="edu-notes-list">
          {notes.length === 0 ? (
            <div className="edu-empty edu-empty-compact">
              <div className="edu-empty-icon">📝</div>
              <div>Aucune note encore.</div>
              <div className="edu-empty-sub">Crée ta première note pour ce contexte.</div>
              <button className="edu-btn" style={{ marginTop: 10 }} onClick={newNote}>
                <Plus size={13} /> Première note
              </button>
            </div>
          ) : notes.map((n) => (
            <div
              key={n._id}
              className={`edu-note-list-item ${activeId === n._id ? 'active' : ''}`}
              onClick={() => setActiveId(n._id)}
            >
              <div className="edu-note-list-title">{n.pinned && <span className="edu-note-list-pin">📌</span>}{n.title || 'Sans titre'}</div>
              <div className="edu-note-list-preview">{n.markdown.replace(/[#>*`\-]/g, '').slice(0, 80) || '—'}</div>
              {n.links.length > 0 && (
                <div className="edu-note-list-links">
                  {n.links.length} lien{n.links.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="edu-note-editor">
          {!activeNote ? (
            <div className="edu-empty">
              <div className="edu-empty-icon">✍️</div>
              <div>Sélectionne ou crée une note.</div>
              <div className="edu-empty-sub">Tape « / » dans un bloc pour les commandes Notion.</div>
            </div>
          ) : (
            <NoteEditor
              note={activeNote}
              onChange={persist}
              templates={templates}
              backlinks={buildBacklinks(activeNote, classes)}
              onApplyTemplate={(t) => {
                const tplBlocks = Array.isArray((t.body as { blocks?: NoteBlock[] }).blocks)
                  ? ((t.body as { blocks: NoteBlock[] }).blocks).map((b) => ({ ...b, id: makeBlockId() }))
                  : []
                if (tplBlocks.length === 0) return
                persist({ ...activeNote, blocks: [...activeNote.blocks, ...tplBlocks] })
              }}
              onDelete={async () => {
                if (!confirm('Supprimer cette note ?')) return
                try {
                  await deleteNote(activeNote._id)
                  setActiveId(null)
                  refresh()
                } catch (err) {
                  setErrorMessage(err instanceof Error ? err.message : 'Impossible de supprimer la note')
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}


export function NoteSaveIndicator({ state }: { state: NoteSaveState }) {
  if (state === 'idle') return null
  const label = state === 'saving' ? 'Sauvegarde…' : state === 'saved' ? 'Sauvegardé' : 'Erreur'
  const color = state === 'error' ? '#EF4444' : state === 'saved' ? '#22C55E' : 'rgba(255,255,255,0.6)'
  return (
    <span
      className="edu-pill"
      style={{ background: 'rgba(255,255,255,0.06)', color, fontSize: 11.5 }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}


export function makeBlockId() { return Math.random().toString(36).slice(2, 10) }

/** Compose un tableau de backlinks à partir des links de la note + contexte. */

export function buildBacklinks(
  note: EducationNote,
  classes: EducationClass[],
  onOpenClass?: (id: string) => void,
): BacklinkEntry[] {
  const map = new Map<string, EducationClass>()
  classes.forEach((c) => map.set(c._id, c))
  return note.links.map((l) => {
    if (l.type === 'class') {
      const c = map.get(l.refId)
      return {
        type: l.type,
        refId: l.refId,
        label: c?.name ?? `Classe ${l.refId.slice(-6)}`,
        meta: c ? [c.school, c.level].filter(Boolean).join(' · ') : undefined,
        onOpen: onOpenClass ? () => onOpenClass(l.refId) : undefined,
      }
    }
    return {
      type: l.type,
      refId: l.refId,
      label: `${l.type === 'session' ? 'Séance' : l.type === 'assignment' ? 'Devoir' : 'Étudiant'} ${l.refId.slice(-6)}`,
    }
  })
}

/* ─── Sessions standalone view ─────────────────────────────────────────── */
