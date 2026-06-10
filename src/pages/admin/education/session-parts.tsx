/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
import { useCallback, useEffect, useState } from 'react'
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
} from 'lucide-react'
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
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { SessionLiveMode } from './SessionLiveMode'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

/** Vrai si la date tombe aujourd'hui (heure locale). */
function isToday(date: string): boolean {
  const d = new Date(date)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export function SessionsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [sessions, setSessions] = useState<EducationSession[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await listSessions({ classId })
    setSessions(r.sessions)
  }, [classId])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>
          {sessions.length} séance{sessions.length > 1 ? 's' : ''}
        </strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> Nouvelle séance
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="edu-empty">Aucune séance planifiée.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Séance</th>
              <th>Statut</th>
              <th>Présence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const present = s.attendance.filter((a) => a.state === 'PRESENT').length
              const total = s.attendance.length
              return (
                <tr key={s._id} onClick={() => setOpenSessionId(s._id)} style={{ cursor: 'pointer' }}>
                  <td>{formatDate(s.date, true)}</td>
                  <td>
                    <strong>{s.title}</strong>
                    {s.theme && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>{s.theme}</div>}
                  </td>
                  <td>
                    <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                  </td>
                  <td>
                    {present} / {total}
                  </td>
                  <td>
                    <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <SessionForm
          classId={classId}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export function SessionForm({
  classId,
  onClose,
  onSaved,
}: {
  classId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    title: '',
    theme: '',
    date: new Date().toISOString().slice(0, 16),
    durationMin: 120,
    location: '',
    agenda: '',
  })
  const [saving, setSaving] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            Nouvelle séance
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Titre</label>
            <input
              className="edu-input"
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Date & heure</label>
              <input
                type="datetime-local"
                className="edu-input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>Durée (min)</label>
              <input
                type="number"
                className="edu-input"
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Thème</label>
            <input
              className="edu-input"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value })}
            />
          </div>
          <div className="edu-form-group">
            <label>Lieu</label>
            <input
              className="edu-input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="edu-form-group">
            <label>Déroulé</label>
            <textarea
              className="edu-textarea"
              value={form.agenda}
              onChange={(e) => setForm({ ...form, agenda: e.target.value })}
            />
          </div>
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="edu-btn"
            disabled={!form.title.trim() || !form.date || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await createSession({
                  classId,
                  title: form.title,
                  theme: form.theme,
                  date: new Date(form.date).toISOString(),
                  durationMin: form.durationMin,
                  location: form.location,
                  agenda: form.agenda,
                })
                onSaved()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Création…' : 'Créer la séance'}
          </button>
        </div>
      </div>
    </>
  )
}

/* SessionDetailDrawer extrait dans ./SessionDetailDrawer.tsx (VENIO-27).
   - Recap central, autosave visible ("Sauvegarde…/Sauvegardé/Erreur").
   - Présence repositionnée en note légère repliable, non centrale. */

/* ─── Assignments tab (kanban) ─────────────────────────────────────────── */

export function SessionsView({
  classes,
  incomingOpenId,
  onCloseIncomingOpen,
}: {
  classes: EducationClass[]
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
}) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)
  const [liveId, setLiveId] = useState<string | null>(null)

  const refreshSessions = useCallback(() => {
    listSessions(filterClass ? { classId: filterClass } : {})
      .then((r) => {
        setItems(r.sessions)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les séances'))
  }, [filterClass])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    if (incomingOpenId) {
      setOpenSessionId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  return (
    <>
      <div>
        <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h1 className="edu-h1">Séances</h1>
          <select
            className="edu-select"
            style={{ width: 220 }}
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
          >
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <p className="edu-sub">
          {items.length} séance{items.length > 1 ? 's' : ''}
        </p>
        {items.length === 0 ? (
          <div className="edu-empty">
            <div className="edu-empty-icon">📅</div>
            <div>{filterClass ? 'Aucune séance pour cette classe.' : 'Aucune séance encore.'}</div>
            <div className="edu-empty-sub">
              Les séances apparaîtront ici dès qu'elles sont planifiées depuis une classe.
            </div>
          </div>
        ) : (
          <table className="edu-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Classe</th>
                <th>Séance</th>
                <th>Statut</th>
                <th>Présence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const cls = typeof s.classId === 'string' ? null : s.classId
                const present = s.attendance.filter((a) => a.state === 'PRESENT').length
                const liveable = isToday(s.date) && s.status !== 'TERMINEE' && s.status !== 'ANNULEE'
                return (
                  <tr key={s._id} onClick={() => setOpenSessionId(s._id)} style={{ cursor: 'pointer' }}>
                    <td>{formatDate(s.date, true)}</td>
                    <td>
                      {cls && (
                        <span className="edu-pill">
                          <span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />
                          {cls.name}
                        </span>
                      )}
                    </td>
                    <td>{s.title}</td>
                    <td>
                      <span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td>
                      {present} / {s.attendance.length}
                    </td>
                    <td>
                      {liveable && (
                        <button
                          className="edu-btn"
                          title="Ouvrir le mode séance (présence un-tap)"
                          onClick={(e) => {
                            e.stopPropagation()
                            setLiveId(s._id)
                          }}
                        >
                          ▶ Live
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
          onChanged={refreshSessions}
        />
      )}
      {liveId && (
        <SessionLiveMode
          sessionId={liveId}
          onClose={() => {
            setLiveId(null)
            refreshSessions()
          }}
          onChanged={refreshSessions}
        />
      )}
    </>
  )
}

/* ─── Assignments standalone view ──────────────────────────────────────── */
