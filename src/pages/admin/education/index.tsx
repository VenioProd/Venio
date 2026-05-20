import { useCallback, useEffect, useState } from 'react'
import {
  GraduationCap, BookOpen, Calendar as CalIcon, ClipboardList, FileText,
  Plus, Search, X, Trash2, Upload, Pin, Archive, ChevronRight, Menu,
} from 'lucide-react'
import {
  fetchDashboard,
  listClasses, getClass, createClass, updateClass, deleteClass,
  listStudents, createStudent, importStudentsCsv, deleteStudent,
  listSessions, createSession,
  listAssignments, getAssignment, createAssignment, updateAssignment, updateSubmission,
  listNotes, createNote, updateNote, deleteNote,
  searchEducation,
  studentDisplayName, formatRelative, formatDate,
  CLASS_STATUS_LABEL, SESSION_STATUS_LABEL,
  ASSIGNMENT_STATUS_LABEL, ASSIGNMENT_STATUS_COLOR, ASSIGNMENT_KIND_LABEL,
  SUBMISSION_STATUS_LABEL,
  CLASS_COLOR_PALETTE,
  type EducationDashboard, type EducationClass, type EducationStudent,
  type EducationSession, type EducationAssignment, type EducationSubmission,
  type EducationNote, type NoteBlock,
  type EducationAssignmentStatus,
} from '../../../services/education'
import { DashboardView } from './DashboardView'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import './EducationWorkspace.css'

type View = 'dashboard' | 'classes' | 'sessions' | 'assignments' | 'notes' | 'search'

export default function EducationWorkspace() {
  const [view, setView] = useState<View>('dashboard')
  const [dashboard, setDashboard] = useState<EducationDashboard | null>(null)
  const [classes, setClasses] = useState<EducationClass[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [school, setSchool] = useState<string>('')
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [classesError, setClassesError] = useState<string | null>(null)

  const refreshDashboard = useCallback(async () => {
    try {
      const r = await fetchDashboard(school ? { school } : {})
      setDashboard(r)
      setDashboardError(null)
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Impossible de charger le cockpit')
    }
  }, [school])

  const refreshClasses = useCallback(async () => {
    try {
      const r = await listClasses()
      setClasses(r.classes)
      setClassesError(null)
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : 'Impossible de charger les classes')
    }
  }, [])

  useEffect(() => {
    refreshDashboard()
    refreshClasses()
  }, [refreshDashboard, refreshClasses])

  // Cmd+K → search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ferme la sidebar mobile à chaque changement de vue.
  function selectView(v: View) {
    setView(v)
    setSidebarOpen(false)
  }

  return (
    <div className="edu-workspace">
      {/* Barre mobile : burger + titre. Reste visible en sticky en haut. */}
      <div className="edu-mobile-bar">
        <button
          type="button"
          className="edu-mobile-burger"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label="Ouvrir la navigation"
          aria-expanded={sidebarOpen}
        >
          <Menu size={16} /> Menu
        </button>
        <div className="edu-mobile-bar-title">Espace pédagogique</div>
        <button
          type="button"
          className="edu-mobile-burger"
          onClick={() => setSearchOpen(true)}
          aria-label="Rechercher"
        >
          <Search size={16} />
        </button>
      </div>

      {/* Backdrop mobile pour la sidebar */}
      <div
        className={`edu-sidebar-backdrop ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      <aside className={`edu-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <h3>Espace pédagogique</h3>
        <button className={`edu-side-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => selectView('dashboard')}>
          <GraduationCap size={15} /> Cockpit
        </button>
        <button className={`edu-side-item ${view === 'classes' ? 'active' : ''}`} onClick={() => selectView('classes')}>
          <BookOpen size={15} /> Classes
          <span className="edu-side-badge">{classes.filter((c) => c.status === 'ACTIVE').length}</span>
        </button>
        <button className={`edu-side-item ${view === 'sessions' ? 'active' : ''}`} onClick={() => selectView('sessions')}>
          <CalIcon size={15} /> Séances
        </button>
        <button className={`edu-side-item ${view === 'assignments' ? 'active' : ''}`} onClick={() => selectView('assignments')}>
          <ClipboardList size={15} /> Devoirs & projets
          {dashboard && dashboard.counters.toGrade > 0 && (
            <span className="edu-side-badge">{dashboard.counters.toGrade}</span>
          )}
        </button>
        <button className={`edu-side-item ${view === 'notes' ? 'active' : ''}`} onClick={() => selectView('notes')}>
          <FileText size={15} /> Notes
        </button>
        <button className="edu-side-item" onClick={() => { setSearchOpen(true); setSidebarOpen(false) }}>
          <Search size={15} /> Recherche
          <span className="edu-side-badge">⌘K</span>
        </button>

        {classes.length > 0 && (
          <>
            <h3>Mes classes</h3>
            {classes.slice(0, 12).map((c) => (
              <button
                key={c._id}
                className="edu-side-item"
                onClick={() => { setSelectedClassId(c._id); selectView('classes') }}
              >
                <span className="edu-side-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </>
        )}
      </aside>

      <main className="edu-main">
        {classesError && (
          <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
            {classesError}
            <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refreshClasses}>Réessayer</button>
          </div>
        )}
        {view === 'dashboard' && (
          <DashboardView
            dashboard={dashboard}
            selectedSchool={school}
            onChangeSchool={setSchool}
            onOpenClass={(id) => { setSelectedClassId(id); selectView('classes') }}
            onCreateClass={() => setShowCreateClass(true)}
            reloadError={dashboardError}
            onReload={refreshDashboard}
          />
        )}
        {view === 'classes' && (
          <ClassesView
            classes={classes}
            onCreate={() => setShowCreateClass(true)}
            onOpen={(id) => setSelectedClassId(id)}
            onRefresh={refreshClasses}
          />
        )}
        {view === 'sessions' && (
          <SessionsView classes={classes} />
        )}
        {view === 'assignments' && (
          <AssignmentsView classes={classes} onChanged={refreshDashboard} />
        )}
        {view === 'notes' && (
          <NotesView classes={classes} />
        )}
      </main>

      {showCreateClass && (
        <ClassFormDrawer
          onClose={() => setShowCreateClass(false)}
          onSaved={async (created) => {
            setShowCreateClass(false)
            await Promise.all([refreshClasses(), refreshDashboard()])
            setSelectedClassId(created._id)
          }}
        />
      )}

      {selectedClassId && (
        <ClassDetailDrawer
          classId={selectedClassId}
          onClose={() => setSelectedClassId(null)}
          onChanged={async () => { await Promise.all([refreshClasses(), refreshDashboard()]) }}
        />
      )}

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onPickClass={(id) => { setSelectedClassId(id); setSearchOpen(false); setView('classes') }}
        />
      )}
    </div>
  )
}

/* DashboardView et Kpi sont extraits dans ./DashboardView.tsx (VENIO-27). */
function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="edu-kpi">
      <div className="edu-kpi-label">{label}</div>
      <div className="edu-kpi-value">{value}</div>
      {sub && <div className="edu-kpi-sub">{sub}</div>}
    </div>
  )
}

/* ─── Classes view ────────────────────────────────────────────────────── */
function ClassesView({
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
          Aucune classe pour l'instant. Crée ta première classe pour commencer.
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

function ClassCard({ klass, onClick }: { klass: EducationClass; onClick: () => void }) {
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
function ClassFormDrawer({
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
type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

function ClassDetailDrawer({
  classId, onClose, onChanged,
}: { classId: string; onClose: () => void; onChanged: () => void }) {
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
            <NotesTab classId={classId} />
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

function OverviewTab({ klass, stats }: { klass: EducationClass; stats: { studentCount: number; sessionCount: number; assignmentCount: number; openAssignments: number } | null }) {
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
function StudentsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [students, setStudents] = useState<EducationStudent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const refresh = useCallback(async () => {
    const r = await listStudents({ classId })
    setStudents(r.students)
  }, [classId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>{students.length} étudiant{students.length > 1 ? 's' : ''}</strong>
        <div className="edu-row" style={{ gap: 6 }}>
          <button className="edu-btn ghost" onClick={() => setShowImport(true)}><Upload size={14} /> Import CSV</button>
          <button className="edu-btn" onClick={() => setShowAdd(true)}><Plus size={14} /> Ajouter</button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="edu-empty">Aucun étudiant. Ajoute-en un ou importe ta liste en CSV.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr><th>Nom</th><th>Email</th><th>Présence</th><th>Moy.</th><th>Statut</th><th></th></tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s._id}>
                <td>{studentDisplayName(s)}</td>
                <td style={{ color: 'rgba(255,255,255,0.65)' }}>{s.email || '—'}</td>
                <td>
                  <span style={{ color: '#22C55E' }}>{s.attendanceCount}</span>
                  {' / '}
                  <span style={{ color: '#EF4444' }}>{s.absenceCount}</span>
                  {' / '}
                  <span style={{ color: '#F59E0B' }}>{s.lateCount}</span>
                </td>
                <td>{s.averageGrade != null ? s.averageGrade.toFixed(1) : '—'}</td>
                <td><span className="edu-pill">{s.status}</span></td>
                <td>
                  <button
                    className="edu-btn-icon"
                    title="Supprimer"
                    onClick={async () => {
                      if (!confirm(`Supprimer ${studentDisplayName(s)} ?`)) return
                      await deleteStudent(s._id)
                      await refresh()
                      onChanged()
                    }}
                  ><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <QuickAddStudent
          classId={classId}
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); await refresh(); onChanged() }}
        />
      )}
      {showImport && (
        <CsvImport
          classId={classId}
          onClose={() => setShowImport(false)}
          onImported={async () => { setShowImport(false); await refresh(); onChanged() }}
        />
      )}
    </div>
  )
}

function QuickAddStudent({ classId, onClose, onSaved }: { classId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(480px, 90vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Nouvel étudiant</h2>
          <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Prénom</label>
              <input className="edu-input" autoFocus value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="edu-form-group">
              <label>Nom</label>
              <input className="edu-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Email</label>
            <input className="edu-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Annuler</button>
          <button className="edu-btn" disabled={!form.lastName.trim() || saving} onClick={async () => {
            setSaving(true); setError(null)
            try {
              await createStudent({ classId, ...form })
              onSaved()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur')
            } finally { setSaving(false) }
          }}>{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
      </div>
    </>
  )
}

function CsvImport({ classId, onClose, onImported }: { classId: string; onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('prenom,nom,email\n')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(640px, 96vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Importer un CSV</h2>
          <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <p className="edu-sub" style={{ marginTop: 0 }}>
            Première ligne = en-têtes. Colonnes reconnues : <code>prenom</code>, <code>nom</code>, <code>email</code>, <code>telephone</code>, <code>id</code>. Séparateur : <code>,</code> <code>;</code> ou tabulation.
          </p>
          <textarea
            className="edu-textarea"
            style={{ minHeight: 240, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {error && <div style={{ color: '#EF4444', fontSize: 13, marginTop: 8 }}>{error}</div>}
          {result && <div style={{ color: '#22C55E', fontSize: 13, marginTop: 8 }}>{result}</div>}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Fermer</button>
          <button className="edu-btn" disabled={importing} onClick={async () => {
            setImporting(true); setError(null); setResult(null)
            try {
              const r = await importStudentsCsv(classId, csv)
              setResult(`${r.inserted} étudiant${r.inserted > 1 ? 's' : ''} importé${r.inserted > 1 ? 's' : ''}.`)
              setTimeout(onImported, 600)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erreur')
            } finally { setImporting(false) }
          }}>{importing ? 'Import…' : 'Importer'}</button>
        </div>
      </div>
    </>
  )
}

/* ─── Sessions tab ─────────────────────────────────────────────────────── */
function SessionsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
  const [sessions, setSessions] = useState<EducationSession[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [openSessionId, setOpenSessionId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const r = await listSessions({ classId })
    setSessions(r.sessions)
  }, [classId])
  useEffect(() => { refresh() }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>{sessions.length} séance{sessions.length > 1 ? 's' : ''}</strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}><Plus size={14} /> Nouvelle séance</button>
      </div>

      {sessions.length === 0 ? (
        <div className="edu-empty">Aucune séance planifiée.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr><th>Date</th><th>Séance</th><th>Statut</th><th>Présence</th><th></th></tr>
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
                  <td><span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span></td>
                  <td>{present} / {total}</td>
                  <td><ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.4)' }} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showCreate && (
        <SessionForm classId={classId} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await refresh(); onChanged() }} />
      )}
      {openSessionId && (
        <SessionDetailDrawer
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
          onChanged={async () => { await refresh(); onChanged() }}
        />
      )}
    </div>
  )
}

function SessionForm({ classId, onClose, onSaved }: { classId: string; onClose: () => void; onSaved: () => void }) {
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
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>Nouvelle séance</h2>
          <button className="edu-btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-form-group">
            <label>Titre</label>
            <input className="edu-input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>Date & heure</label>
              <input type="datetime-local" className="edu-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="edu-form-group">
              <label>Durée (min)</label>
              <input type="number" className="edu-input" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="edu-form-group">
            <label>Thème</label>
            <input className="edu-input" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
          </div>
          <div className="edu-form-group">
            <label>Lieu</label>
            <input className="edu-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="edu-form-group">
            <label>Déroulé</label>
            <textarea className="edu-textarea" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Annuler</button>
          <button className="edu-btn" disabled={!form.title.trim() || !form.date || saving} onClick={async () => {
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
            } finally { setSaving(false) }
          }}>{saving ? 'Création…' : 'Créer la séance'}</button>
        </div>
      </div>
    </>
  )
}

/* SessionDetailDrawer extrait dans ./SessionDetailDrawer.tsx (VENIO-27).
   - Recap central, autosave visible ("Sauvegarde…/Sauvegardé/Erreur").
   - Présence repositionnée en note légère repliable, non centrale. */

/* ─── Assignments tab (kanban) ─────────────────────────────────────────── */
function AssignmentsTab({ classId, onChanged }: { classId: string; onChanged: () => void }) {
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

function AssignmentForm({ classId, onClose, onSaved }: { classId: string; onClose: () => void; onSaved: () => void }) {
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

function AssignmentDetailDrawer({
  assignmentId, onClose, onChanged,
}: { assignmentId: string; onClose: () => void; onChanged: () => void }) {
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
function NotesTab({ classId }: { classId: string }) {
  return <NotesView classes={[]} fixedLink={{ type: 'class', refId: classId }} />
}

/* ─── Notes view ───────────────────────────────────────────────────────── */
type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'

function NotesView({ classes: _classes, fixedLink }: { classes: EducationClass[]; fixedLink?: { type: 'class' | 'session' | 'assignment' | 'student'; refId: string } }) {
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
            <div className="edu-empty">Aucune note encore.</div>
          ) : notes.map((n) => (
            <div
              key={n._id}
              className={`edu-note-list-item ${activeId === n._id ? 'active' : ''}`}
              onClick={() => setActiveId(n._id)}
            >
              <div className="edu-note-list-title">{n.pinned && <Pin size={11} style={{ marginRight: 4 }} />}{n.title || 'Sans titre'}</div>
              <div className="edu-note-list-preview">{n.markdown.replace(/[#>*`\-]/g, '').slice(0, 80) || '—'}</div>
            </div>
          ))}
        </div>
        <div className="edu-note-editor">
          {!activeNote ? (
            <div className="edu-empty">Sélectionne ou crée une note.</div>
          ) : (
            <NoteEditor
              note={activeNote}
              onChange={persist}
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

function NoteSaveIndicator({ state }: { state: NoteSaveState }) {
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

function makeBlockId() { return Math.random().toString(36).slice(2, 10) }

function NoteEditor({ note, onChange, onDelete }: { note: EducationNote; onChange: (n: EducationNote) => void; onDelete: () => void }) {
  function updateBlock(idx: number, patch: Partial<NoteBlock>) {
    const blocks = note.blocks.map((b, i) => i === idx ? { ...b, ...patch } : b)
    onChange({ ...note, blocks })
  }
  function addBlockAfter(idx: number, type: NoteBlock['type'] = 'paragraph') {
    const blocks = [...note.blocks]
    blocks.splice(idx + 1, 0, { id: makeBlockId(), type, text: '', checked: false, level: 1, meta: {} })
    onChange({ ...note, blocks })
  }
  function removeBlock(idx: number) {
    if (note.blocks.length <= 1) return
    const blocks = note.blocks.filter((_, i) => i !== idx)
    onChange({ ...note, blocks })
  }

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 4 }}>
        <input
          className="edu-note-title"
          value={note.title}
          placeholder="Sans titre"
          onChange={(e) => onChange({ ...note, title: e.target.value })}
        />
        <div className="edu-row" style={{ gap: 4 }}>
          <button className="edu-btn-icon" title="Épingler" onClick={() => onChange({ ...note, pinned: !note.pinned })}>
            <Pin size={16} color={note.pinned ? '#22C55E' : undefined} />
          </button>
          <button className="edu-btn-icon" title="Archiver" onClick={() => onChange({ ...note, archived: !note.archived })}>
            <Archive size={16} color={note.archived ? '#F59E0B' : undefined} />
          </button>
          <button className="edu-btn-icon" title="Supprimer" onClick={onDelete}><Trash2 size={16} /></button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Mis à jour {formatRelative(note.updatedAt)}</div>

      {note.blocks.map((b, i) => (
        <div key={b.id} className="edu-block">
          <span className="edu-block-handle">⋮⋮</span>
          {b.type === 'checklist' && (
            <input
              type="checkbox"
              className="edu-block-checkbox"
              checked={b.checked}
              onChange={(e) => updateBlock(i, { checked: e.target.checked })}
            />
          )}
          <select
            className="edu-select edu-block-type-pill"
            value={b.type}
            onChange={(e) => updateBlock(i, { type: e.target.value as NoteBlock['type'] })}
          >
            <option value="paragraph">¶</option>
            <option value="heading">H</option>
            <option value="checklist">☐</option>
            <option value="bullet">•</option>
            <option value="quote">❝</option>
            <option value="code">{'</>'}</option>
            <option value="callout">💡</option>
          </select>
          <textarea
            className={`edu-block-input ${b.type === 'heading' ? `heading-${Math.min(Math.max(b.level || 1, 1), 3)}` : b.type === 'code' ? 'code' : b.type === 'quote' ? 'quote' : ''}`}
            value={b.text}
            placeholder={b.type === 'heading' ? 'Titre…' : 'Écris quelque chose…'}
            onChange={(e) => updateBlock(i, { text: e.target.value })}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                addBlockAfter(i)
              }
              if (e.key === 'Backspace' && b.text === '' && note.blocks.length > 1) {
                e.preventDefault()
                removeBlock(i)
              }
            }}
          />
        </div>
      ))}
      <button className="edu-btn ghost" style={{ marginTop: 12 }} onClick={() => addBlockAfter(note.blocks.length - 1)}>
        <Plus size={13} /> Ajouter un bloc
      </button>
    </div>
  )
}

/* ─── Sessions standalone view ─────────────────────────────────────────── */
function SessionsView({ classes }: { classes: EducationClass[] }) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationSession[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSessions(filterClass ? { classId: filterClass } : {})
      .then((r) => { setItems(r.sessions); setError(null) })
      .catch((err) => setError(err instanceof Error ? err.message : 'Impossible de charger les séances'))
  }, [filterClass])

  return (
    <div>
      <div className="edu-row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h1 className="edu-h1">Séances</h1>
        <select className="edu-select" style={{ width: 220 }} value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
          <option value="">Toutes les classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>
      {error && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>
      )}
      <p className="edu-sub">{items.length} séance{items.length > 1 ? 's' : ''}</p>
      {items.length === 0 ? (
        <div className="edu-empty">Aucune séance.</div>
      ) : (
        <table className="edu-table">
          <thead>
            <tr><th>Date</th><th>Classe</th><th>Séance</th><th>Statut</th><th>Présence</th></tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const cls = typeof s.classId === 'string' ? null : s.classId
              const present = s.attendance.filter((a) => a.state === 'PRESENT').length
              return (
                <tr key={s._id}>
                  <td>{formatDate(s.date, true)}</td>
                  <td>{cls && <span className="edu-pill"><span className="edu-pill-dot" style={{ background: cls.color || '#22C55E' }} />{cls.name}</span>}</td>
                  <td>{s.title}</td>
                  <td><span className="edu-pill">{SESSION_STATUS_LABEL[s.status]}</span></td>
                  <td>{present} / {s.attendance.length}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ─── Assignments standalone view ──────────────────────────────────────── */
function AssignmentsView({ classes, onChanged }: { classes: EducationClass[]; onChanged: () => void }) {
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

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
      <div className="edu-kanban">
        {cols.map((col) => {
          const list = items.filter((i) => i.status === col.status)
          return (
            <div key={col.status} className="edu-kanban-col">
              <div className="edu-kanban-col-head">
                <span>{col.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
              </div>
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
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => { await refresh(); onChanged() }}
        />
      )}
    </div>
  )
}

/* ─── Search modal ─────────────────────────────────────────────────────── */
function SearchModal({ onClose, onPickClass }: { onClose: () => void; onPickClass: (id: string) => void }) {
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
