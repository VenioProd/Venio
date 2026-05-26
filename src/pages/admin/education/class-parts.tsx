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
import { StudentsTab } from './student-parts'
import { SessionsTab } from './session-parts'
import { AssignmentsTab } from './assignment-parts'
import { NotesTab } from './note-parts'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

export function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="edu-kpi">
      <div className="edu-kpi-label">{label}</div>
      <div className="edu-kpi-value">{value}</div>
      {sub && <div className="edu-kpi-sub">{sub}</div>}
    </div>
  )
}

/* ─── Classes view ────────────────────────────────────────────────────── */

export function ClassesView({
  classes, onCreate, onOpen, onRefresh,
}: { classes: EducationClass[]; onCreate: () => void; onOpen: (id: string) => void; onRefresh: () => void }) {
  return (
    <div>
      <div className="edu-row between">
        <div>
          <h1 className="edu-h1">Classes</h1>
          <p className="edu-sub">{classes.length} classe{classes.length > 1 ? 's' : ''} suivie{classes.length > 1 ? 's' : ''}.</p>
        </div>
        <div className="edu-row" style={{ gap: 6 }}>
          <button className="edu-btn ghost" onClick={onRefresh}>Rafraîchir</button>
          <button className="edu-btn" onClick={onCreate}><Plus size={14} /> Nouvelle classe</button>
        </div>
      </div>

      {classes.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">📚</div>
          <div>Aucune classe pour l'instant.</div>
          <div className="edu-empty-sub">
            Crée ta première classe pour démarrer ton cockpit : étudiants, séances, devoirs et notes s'organiseront autour.
          </div>
          <button className="edu-btn" style={{ marginTop: 12 }} onClick={onCreate}>
            <Plus size={13} /> Créer ma première classe
          </button>
        </div>
      ) : (
        <div className="edu-class-grid">
          {classes.map((c) => (
            <ClassCard key={c._id} klass={c} onClick={() => onOpen(c._id)} />
          ))}
        </div>
      )}
    </div>
  )
}


export function ClassCard({ klass, onClick }: { klass: EducationClass; onClick: () => void }) {
  const [stats, setStats] = useState<{ studentCount: number; sessionCount: number; openAssignments: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    getClass(klass._id).then((r) => { if (!cancelled) setStats(r.stats) }).catch(() => {})
    return () => { cancelled = true }
  }, [klass._id])
  return (
    <div className="edu-class-card" onClick={onClick}>
      <div className="edu-color-strip" style={{ background: klass.color }} />
      <div className="edu-class-card-title">{klass.name}</div>
      <div className="edu-class-card-meta">
        {[klass.school, klass.level, klass.program].filter(Boolean).join(' · ') || '—'}
      </div>
      <div className="edu-class-card-stats">
        <div className="edu-class-card-stat"><strong>{stats?.studentCount ?? '·'}</strong> étudiants</div>
        <div className="edu-class-card-stat"><strong>{stats?.sessionCount ?? '·'}</strong> séances</div>
        {(stats?.openAssignments ?? 0) > 0 && (
          <div className="edu-class-card-stat"><strong>{stats?.openAssignments}</strong> devoirs ouverts</div>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="edu-pill">{CLASS_STATUS_LABEL[klass.status]}</span>
      </div>
    </div>
  )
}

/* ─── Class form drawer (create/edit) ──────────────────────────────────── */

export function ClassFormDrawer({
  initial, onClose, onSaved,
}: { initial?: EducationClass; onClose: () => void; onSaved: (c: EducationClass) => void }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    school: initial?.school ?? '',
    level: initial?.level ?? '',
    program: initial?.program ?? '',
    color: initial?.color ?? CLASS_COLOR_PALETTE[0],
    weeklyHours: initial?.weeklyHours ?? null,
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'ACTIVE',
    periodStart: initial?.period?.start?.slice(0, 10) ?? '',
    periodEnd: initial?.period?.end?.slice(0, 10) ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        school: form.school.trim(),
        level: form.level.trim(),
        program: form.program.trim(),
        color: form.color,
        weeklyHours: form.weeklyHours,
        notes: form.notes,
        status: form.status,
        period: {
          start: form.periodStart || null,
          end: form.periodEnd || null,
        },
      }
      const r = initial
        ? await updateClass(initial._id, payload)
        : await createClass(payload)
      onSaved(r.class)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{initial ? 'Modifier la classe' : 'Nouvelle classe'}</h2>
          <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Nom de la classe</label>
            <input className="edu-input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. BTS Communication 1A" />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>École</label>
              <input className="edu-input" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
            </div>
            <div className="edu-form-group">
              <label>Niveau</label>
              <input className="edu-input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="BAC+1, M1…" />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Programme / matière</label>
            <input className="edu-input" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Début</label>
              <input type="date" className="edu-input" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div className="edu-form-group">
              <label>Fin</label>
              <input type="date" className="edu-input" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Heures / semaine</label>
              <input type="number" className="edu-input" value={form.weeklyHours ?? ''} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div className="edu-form-group">
              <label>Statut</label>
              <select className="edu-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EducationClass['status'] })}>
                {Object.entries(CLASS_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="edu-form-group">
            <label>Couleur</label>
            <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {CLASS_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 26, height: 26, borderRadius: 7, background: c,
                    border: c === form.color ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="edu-form-group">
            <label>Notes internes</label>
            <textarea className="edu-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes libres sur la classe…" />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Annuler</button>
          <button className="edu-btn" disabled={!form.name.trim() || saving} onClick={save}>
            {saving ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer la classe'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ─── Class detail drawer with tabs ────────────────────────────────────── */


export function ClassDetailDrawer({
  classId, onClose, onChanged, templates, onTemplatesChanged,
}: { classId: string; onClose: () => void; onChanged: () => void; templates?: EducationTemplate[]; onTemplatesChanged?: () => void }) {
  const [klass, setKlass] = useState<EducationClass | null>(null)
  const [stats, setStats] = useState<{ studentCount: number; sessionCount: number; assignmentCount: number; openAssignments: number } | null>(null)
  const [tab, setTab] = useState<ClassTab>('overview')
  const [editing, setEditing] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await getClass(classId)
      setKlass(r.class)
      setStats(r.stats)
    } catch { onClose() }
  }, [classId, onClose])

  useEffect(() => { refresh() }, [refresh])

  if (!klass) return null

  async function handleDelete() {
    if (!confirm(`Supprimer la classe "${klass!.name}" ? Les étudiants, séances et devoirs liés seront aussi soft-supprimés.`)) return
    await deleteClass(classId)
    onChanged()
    onClose()
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div className="edu-row" style={{ gap: 10 }}>
            <span className="edu-side-dot" style={{ background: klass.color, width: 14, height: 14, borderRadius: 4 }} />
            <div>
              <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{klass.name}</h2>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {[klass.school, klass.level, klass.program].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6 }}>
            <button className="edu-btn ghost" onClick={() => setEditing(true)}>Modifier</button>
            <button className="edu-btn-icon" onClick={handleDelete} title="Supprimer"><Trash2 size={16} /></button>
            <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div style={{ padding: '0 24px' }}>
          <div className="edu-tabs">
            {([
              ['overview', "Vue d'ensemble"],
              ['students', 'Étudiants'],
              ['sessions', 'Séances'],
              ['assignments', 'Devoirs'],
              ['notes', 'Notes'],
            ] as Array<[ClassTab, string]>).map(([k, label]) => (
              <button key={k} className={`edu-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="edu-drawer-body">
          {tab === 'overview' && (
            <OverviewTab klass={klass} stats={stats} />
          )}
          {tab === 'students' && (
            <StudentsTab classId={classId} onChanged={() => { refresh(); onChanged() }} />
          )}
          {tab === 'sessions' && (
            <SessionsTab classId={classId} onChanged={() => { refresh(); onChanged() }} />
          )}
          {tab === 'assignments' && (
            <AssignmentsTab classId={classId} onChanged={() => { refresh(); onChanged() }} />
          )}
          {tab === 'notes' && (
            <NotesTab classId={classId} templates={templates} onTemplatesChanged={onTemplatesChanged} />
          )}
        </div>
      </div>

      {editing && (
        <ClassFormDrawer
          initial={klass}
          onClose={() => setEditing(false)}
          onSaved={async () => { setEditing(false); await refresh(); onChanged() }}
        />
      )}
    </>
  )
}


export function OverviewTab({ klass, stats }: { klass: EducationClass; stats: { studentCount: number; sessionCount: number; assignmentCount: number; openAssignments: number } | null }) {
  return (
    <div>
      <div className="edu-kpi-grid">
        <Kpi label="Étudiants" value={stats?.studentCount ?? '—'} />
        <Kpi label="Séances" value={stats?.sessionCount ?? '—'} />
        <Kpi label="Devoirs" value={stats?.assignmentCount ?? '—'} />
        <Kpi label="Devoirs ouverts" value={stats?.openAssignments ?? '—'} />
      </div>
      <h2 className="edu-h2">Période & volume</h2>
      <div style={{ fontSize: 13.5 }}>
        <p>Période : {klass.period.start ? formatDate(klass.period.start) : '—'} → {klass.period.end ? formatDate(klass.period.end) : '—'}</p>
        <p>Heures hebdomadaires : {klass.weeklyHours ?? '—'} h</p>
        <p>Volume total : {klass.totalHours ?? '—'} h</p>
        <p>Statut : <span className="edu-pill">{CLASS_STATUS_LABEL[klass.status]}</span></p>
      </div>
      {klass.notes && (
        <>
          <h2 className="edu-h2">Notes internes</h2>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'rgba(255,255,255,0.85)' }}>{klass.notes}</div>
        </>
      )}
    </div>
  )
}

/* ─── Students tab ─────────────────────────────────────────────────────── */
