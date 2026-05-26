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
} from '../../../services/education'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'
import { Kpi } from './class-parts'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

export function AssignmentsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refresh = useCallback(async () => {
    const r = await listAssignments({ classId })
    setItems(r.assignments)
  }, [classId])
  useEffect(() => { refresh() }, [refresh])

  const cols: { status: EducationAssignmentStatus; label: string }[] = [
    { status: 'DRAFT', label: 'Brouillon' },
    { status: 'OUVERT', label: 'Ouvert' },
    { status: 'EN_CORRECTION', label: 'En correction' },
    { status: 'CLOS', label: 'Clos' },
  ]

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>{items.length} devoir{items.length > 1 ? 's' : ''}</strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}><Plus size={14} /> Nouveau devoir</button>
      </div>

      <div className="edu-kanban">
        {cols.map((col) => {
          const list = items.filter((i) => i.status === col.status)
          return (
            <div key={col.status} className="edu-kanban-col">
              <div className="edu-kanban-col-head">
                <span>{col.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
              </div>
              {list.map((a) => (
                <div key={a._id} className="edu-kanban-card" onClick={() => setOpenId(a._id)}>
                  <div className="edu-kanban-card-title">{a.title}</div>
                  <div className="edu-kanban-card-meta">
                    {ASSIGNMENT_KIND_LABEL[a.kind]}
                    {a.deadline && ` · ${formatDate(a.deadline)}`}
                  </div>
                </div>
              ))}
              {list.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>—</div>}
            </div>
          )
        })}
      </div>

      {showCreate && (
        <AssignmentForm classId={classId} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await refresh(); onChanged() }} />
      )}
      {openId && (
        <AssignmentDetailDrawer assignmentId={openId} onClose={() => setOpenId(null)} onChanged={async () => { await refresh(); onChanged() }} />
      )}
    </div>
  )
}


export function AssignmentForm({ classId, onClose, onSaved }: { classId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '', kind: 'DEVOIR' as EducationAssignment['kind'],
    instructions: '', deadline: '', maxGrade: 20, weight: 1,
    status: 'OUVERT' as EducationAssignmentStatus,
  })
  const [saving, setSaving] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Nouveau devoir</h2>
          <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Titre</label>
            <input className="edu-input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Type</label>
              <select className="edu-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as EducationAssignment['kind'] })}>
                {Object.entries(ASSIGNMENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select className="edu-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EducationAssignmentStatus })}>
                {Object.entries(ASSIGNMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Échéance</label>
              <input type="datetime-local" className="edu-input" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
            <div className="edu-form-group">
              <label>Note max</label>
              <input type="number" className="edu-input" value={form.maxGrade} onChange={(e) => setForm({ ...form, maxGrade: Number(e.target.value) })} />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Consignes</label>
            <textarea className="edu-textarea" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Annuler</button>
          <button className="edu-btn" disabled={!form.title.trim() || saving} onClick={async () => {
            setSaving(true)
            try {
              await createAssignment({
                classId,
                title: form.title,
                kind: form.kind,
                status: form.status,
                instructions: form.instructions,
                deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
                maxGrade: form.maxGrade,
                weight: form.weight,
              })
              onSaved()
            } finally { setSaving(false) }
          }}>{saving ? 'Création…' : 'Créer'}</button>
        </div>
      </div>
    </>
  )
}


export function AssignmentDetailDrawer({
  assignmentId, onClose, onChanged, onStartCorrection,
}: {
  assignmentId: string
  onClose: () => void
  onChanged: () => void
  onStartCorrection?: (id: string) => void
}) {
  const [data, setData] = useState<{
    assignment: EducationAssignment
    submissions: EducationSubmission[]
    stats: { total: number; rendu: number; corrige: number; nonRendu: number; retard: number; moyenne: number | null }
  } | null>(null)

  const refresh = useCallback(async () => {
    setData(await getAssignment(assignmentId))
  }, [assignmentId])
  useEffect(() => { refresh() }, [refresh])

  if (!data) return null
  const { assignment, submissions, stats } = data

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{assignment.title}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {ASSIGNMENT_KIND_LABEL[assignment.kind]}
              {assignment.deadline && ` · échéance ${formatDate(assignment.deadline)}`}
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6 }}>
            <select
              className="edu-select"
              style={{ width: 'auto' }}
              value={assignment.status}
              onChange={async (e) => {
                await updateAssignment(assignmentId, { status: e.target.value as EducationAssignmentStatus })
                await refresh(); onChanged()
              }}
            >
              {Object.entries(ASSIGNMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {onStartCorrection && (
              <button className="edu-btn" onClick={() => onStartCorrection(assignmentId)} title="Ouvrir le mode correction groupée">
                Mode correction
              </button>
            )}
            <a
              className="edu-btn ghost"
              href={assignmentExportUrl(assignmentId)}
              target="_blank" rel="noopener"
              title="Exporter les corrections en CSV"
            >Export CSV</a>
            <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-kpi-grid">
            <Kpi label="Rendus" value={`${stats.rendu} / ${stats.total}`} />
            <Kpi label="En retard" value={stats.retard} />
            <Kpi label="Corrigés" value={stats.corrige} />
            <Kpi label="Moyenne" value={stats.moyenne != null ? stats.moyenne : '—'} sub={`/ ${assignment.maxGrade}`} />
          </div>

          {assignment.instructions && (
            <>
              <h2 className="edu-h2">Consignes</h2>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8 }}>{assignment.instructions}</div>
            </>
          )}

          <h2 className="edu-h2">Suivi par étudiant</h2>
          {submissions.length === 0 ? (
            <div className="edu-empty">
              Le devoir est encore en brouillon. Passe-le à <strong>Ouvert</strong> pour créer les soumissions.
            </div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr><th>Étudiant</th><th>Statut</th><th>Note</th><th>Feedback</th></tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const stu = typeof s.studentId === 'string' ? null : s.studentId
                  return (
                    <tr key={s._id}>
                      <td>{stu ? studentDisplayName(stu) : '—'}</td>
                      <td>
                        <select
                          className="edu-select"
                          style={{ width: 'auto', minWidth: 130 }}
                          value={s.status}
                          onChange={async (e) => {
                            const studentId = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            await updateSubmission(assignmentId, studentId, { status: e.target.value as EducationSubmission['status'] })
                            await refresh()
                          }}
                        >
                          {Object.entries(SUBMISSION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="edu-input"
                          style={{ width: 80 }}
                          step="0.5"
                          max={assignment.maxGrade}
                          min={0}
                          value={s.grade ?? ''}
                          onChange={async (e) => {
                            const studentId = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            await updateSubmission(assignmentId, studentId, { grade: v, status: v != null ? 'CORRIGE' : s.status })
                            await refresh(); onChanged()
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="edu-input"
                          style={{ minWidth: 200 }}
                          value={s.feedback}
                          placeholder="Feedback…"
                          onBlur={async (e) => {
                            const studentId = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            if (e.target.value !== s.feedback) {
                              await updateSubmission(assignmentId, studentId, { feedback: e.target.value })
                              await refresh()
                            }
                          }}
                          defaultValue={s.feedback}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── Notes tab ────────────────────────────────────────────────────────── */

export function AssignmentsView({
  classes, onChanged, incomingOpenId, onCloseIncomingOpen, onStartCorrection,
}: {
  classes: EducationClass[]
  onChanged: () => void
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
  onStartCorrection?: (id: string) => void
}) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (incomingOpenId) {
      setOpenId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  const refresh = useCallback(async () => {
    const r = await listAssignments(filterClass ? { classId: filterClass } : {})
    setItems(r.assignments)
  }, [filterClass])

  useEffect(() => { refresh() }, [refresh])

  const cols: { status: EducationAssignmentStatus; label: string }[] = [
    { status: 'DRAFT', label: 'Brouillon' },
    { status: 'OUVERT', label: 'Ouvert' },
    { status: 'EN_CORRECTION', label: 'En correction' },
    { status: 'CLOS', label: 'Clos' },
  ]

  return (
    <div>
      <div className="edu-row between">
        <h1 className="edu-h1">Devoirs & projets</h1>
        <select className="edu-select" style={{ width: 220 }} value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>
      <p className="edu-sub">{items.length} devoir{items.length > 1 ? 's' : ''}</p>
      {items.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">📋</div>
          <div>{filterClass ? 'Aucun devoir pour cette classe.' : 'Aucun devoir encore.'}</div>
          <div className="edu-empty-sub">Crée un devoir depuis l'onglet « Devoirs » d'une classe pour démarrer le kanban.</div>
        </div>
      ) : (
        <div className="edu-kanban">
          {cols.map((col) => {
            const list = items.filter((i) => i.status === col.status)
            return (
              <div key={col.status} className="edu-kanban-col">
                <div className="edu-kanban-col-head">
                  <span>{col.label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
                </div>
                {list.length === 0 && (
                  <div className="edu-kanban-empty">—</div>
                )}
                {list.map((a) => {
                  const cls = typeof a.classId === 'string' ? null : a.classId
                  return (
                    <div key={a._id} className="edu-kanban-card" onClick={() => setOpenId(a._id)}>
                      <div className="edu-kanban-card-title">{a.title}</div>
                      <div className="edu-kanban-card-meta">
                        {cls && <span style={{ color: cls.color }}>● </span>}
                        {ASSIGNMENT_KIND_LABEL[a.kind]}
                        {a.deadline && ` · ${formatDate(a.deadline)}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => { await refresh(); onChanged() }}
          onStartCorrection={onStartCorrection}
        />
      )}
    </div>
  )
}

/* ─── Search modal ─────────────────────────────────────────────────────── */
