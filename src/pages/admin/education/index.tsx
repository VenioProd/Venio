import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
} from 'lucide-react'
import {
  fetchDashboard,
  getStudent,
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
  type EducationDashboardAlert,
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
import { DashboardView } from './DashboardView'
import { SessionLiveMode } from './SessionLiveMode'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { CalendarEventWorkspaceDrawer } from './CalendarEventWorkspaceDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { TemplatesView } from './TemplatesView'
import { CorrectionMode } from './CorrectionMode'
import { AdvancedSearchView } from './AdvancedSearchView'
import { SchoolsView } from './SchoolsView'
import { CalendarView } from './CalendarView'
import { DocumentsView } from './DocumentsView'
import type { UpcomingCalendarEvent } from '../../../services/educationCalendar'
import { Building2, FileSearch, CalendarDays, Download } from 'lucide-react'
import { NotionImportView } from './NotionImportView'
import './EducationWorkspace.css'
import { Kpi, ClassesView, ClassFormDrawer } from './class-parts'
import { ClassWorkspace } from './ClassWorkspace'
import { SessionsView } from './session-parts'
import { AssignmentsView } from './assignment-parts'
import { NotesView } from './note-parts'
import { SearchModal } from './search-parts'
import { StudentProfileDrawer } from './StudentProfileDrawer'

type View =
  | 'dashboard'
  | 'classes'
  | 'sessions'
  | 'assignments'
  | 'notes'
  | 'documents'
  | 'templates'
  | 'search'
  | 'advanced-search'
  | 'schools'
  | 'calendar'
  | 'notion-import'

/* ─── Reprise du dernier contexte (VENIO-75) ───────────────────────────── */

const CONTEXT_KEY = 'edu-workspace-context-v1'

/** Vues restaurables ('search' exclue : c'est une modale, pas une vue). */
const RESTORABLE_VIEWS: View[] = [
  'dashboard',
  'classes',
  'sessions',
  'assignments',
  'notes',
  'documents',
  'templates',
  'advanced-search',
  'schools',
  'calendar',
  'notion-import',
]

type WorkspaceContext = { view: View; selectedClassId: string | null; school: string }

/** Contexte persisté, validé champ par champ (fallback : cockpit, rien de sélectionné). */
function loadContext(): WorkspaceContext {
  const fallback: WorkspaceContext = { view: 'dashboard', selectedClassId: null, school: '' }
  try {
    const raw = localStorage.getItem(CONTEXT_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<WorkspaceContext>
    return {
      view: RESTORABLE_VIEWS.includes(p.view as View) ? (p.view as View) : 'dashboard',
      // Revalidé après chargement des classes (remis à null s'il n'existe plus).
      selectedClassId: typeof p.selectedClassId === 'string' ? p.selectedClassId : null,
      school: typeof p.school === 'string' ? p.school : '',
    }
  } catch {
    return fallback
  }
}

export default function EducationWorkspace() {
  const dashboardRequest = useRef(0)
  const dashboardScope = useRef<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const cockpitScroll = useRef<{ main: number; window: number } | null>(null)
  const [view, setView] = useState<View>(() => loadContext().view)
  const [dashboard, setDashboard] = useState<EducationDashboard | null>(null)
  const [classes, setClasses] = useState<EducationClass[]>([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [templates, setTemplates] = useState<EducationTemplate[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => loadContext().selectedClassId)
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cockpitSession, setCockpitSession] = useState<{ id: string; live: boolean } | null>(null)
  const [correctionAssignmentId, setCorrectionAssignmentId] = useState<string | null>(null)
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const [pendingNoteId, setPendingNoteId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [school, setSchool] = useState<string>(() => loadContext().school)
  const [calendarEvent, setCalendarEvent] = useState<UpcomingCalendarEvent | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [classesError, setClassesError] = useState<string | null>(null)
  const [profileState, setProfileState] = useState<{
    student: EducationStudent
    followUpAlert: EducationDashboardAlert | null
  } | null>(null)

  useLayoutEffect(() => {
    if (!selectedClassId && view === 'dashboard' && cockpitScroll.current) {
      if (mainRef.current) mainRef.current.scrollTop = cockpitScroll.current.main
      window.scrollTo(0, cockpitScroll.current.window)
      cockpitScroll.current = null
    }
  }, [selectedClassId, view])

  const refreshDashboard = useCallback(async () => {
    const request = ++dashboardRequest.current
    if (dashboardScope.current !== school) setDashboard(null)
    dashboardScope.current = school
    try {
      const r = await fetchDashboard(school ? { school } : {})
      if (request !== dashboardRequest.current) return
      setDashboard(r)
      setDashboardError(null)
    } catch (err) {
      if (request === dashboardRequest.current)
        setDashboardError(err instanceof Error ? err.message : 'Impossible de charger le cockpit')
    }
  }, [school])

  const refreshClasses = useCallback(async () => {
    try {
      const r = await listClasses()
      setClasses(r.classes)
      setClassesLoaded(true)
      setClassesError(null)
    } catch (err) {
      setClassesError(err instanceof Error ? err.message : 'Impossible de charger les classes')
    }
  }, [])

  const refreshTemplates = useCallback(async () => {
    try {
      const r = await listTemplates()
      setTemplates(r.templates)
    } catch {
      // Best-effort : si l'API templates n'est pas dispo, on n'empêche pas le cockpit.
      setTemplates([])
    }
  }, [])

  useEffect(() => {
    refreshDashboard()
    refreshClasses()
    refreshTemplates()
  }, [refreshDashboard, refreshClasses, refreshTemplates])

  // Persistance du contexte courant (vue, classe ouverte, école filtrée).
  useEffect(() => {
    try {
      localStorage.setItem(CONTEXT_KEY, JSON.stringify({ view, selectedClassId, school }))
    } catch {
      // Stockage indisponible (quota, navigation privée) : non bloquant.
    }
  }, [view, selectedClassId, school])

  // Invalide la classe restaurée si elle n'existe plus après chargement.
  useEffect(() => {
    if (!classesLoaded || !selectedClassId) return
    if (!classes.some((c) => c._id === selectedClassId)) setSelectedClassId(null)
  }, [classesLoaded, classes, selectedClassId])

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

  async function openStudentFollowUp(alert: EducationDashboardAlert) {
    try {
      const result = await getStudent(alert.student._id)
      setProfileState({ student: result.student, followUpAlert: alert })
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Impossible d’ouvrir la fiche étudiant')
    }
  }

  return (
    <div className={`edu-workspace ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      {/* Barre mobile : burger + titre. Reste visible en sticky en haut. */}
      <div className="edu-mobile-bar">
        <button
          type="button"
          className="edu-mobile-burger"
          onClick={() => {
            setSidebarCollapsed(false)
            setSidebarOpen((v) => !v)
          }}
          aria-label="Ouvrir la navigation"
          aria-expanded={sidebarOpen}
        >
          <Menu size={16} /> Menu
        </button>
        <div className="edu-mobile-bar-title">Espace pédagogique</div>
        <button type="button" className="edu-mobile-burger" onClick={() => setSearchOpen(true)} aria-label="Rechercher">
          <Search size={16} />
        </button>
      </div>

      {/* Backdrop mobile pour la sidebar */}
      <div
        className={`edu-sidebar-backdrop ${sidebarOpen ? 'is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      <aside className={`edu-sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="edu-sidebar-title-row">
          <h3>Espace pédagogique</h3>
          <button
            type="button"
            className="edu-sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? 'Déplier le panneau pédagogique' : 'Rétracter le panneau pédagogique'}
            title={sidebarCollapsed ? 'Déplier' : 'Rétracter'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>
        <button
          className={`edu-side-item ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => selectView('dashboard')}
        >
          <GraduationCap size={15} /> Cockpit
        </button>
        <button className={`edu-side-item ${view === 'classes' ? 'active' : ''}`} onClick={() => selectView('classes')}>
          <BookOpen size={15} /> Classes
          <span className="edu-side-badge">{classes.filter((c) => c.status === 'ACTIVE').length}</span>
        </button>
        <button
          className={`edu-side-item ${view === 'sessions' ? 'active' : ''}`}
          onClick={() => selectView('sessions')}
        >
          <CalIcon size={15} /> Séances
        </button>
        <button
          className={`edu-side-item ${view === 'calendar' ? 'active' : ''}`}
          onClick={() => selectView('calendar')}
        >
          <CalendarDays size={15} /> Calendrier Apple
        </button>
        <button
          className={`edu-side-item ${view === 'assignments' ? 'active' : ''}`}
          onClick={() => selectView('assignments')}
        >
          <ClipboardList size={15} /> Devoirs & projets
          {dashboard && dashboard.counters.toGrade > 0 && (
            <span className="edu-side-badge">{dashboard.counters.toGrade}</span>
          )}
        </button>
        <button className={`edu-side-item ${view === 'notes' ? 'active' : ''}`} onClick={() => selectView('notes')}>
          <FileText size={15} /> Notes
        </button>
        <button
          className={`edu-side-item ${view === 'documents' ? 'active' : ''}`}
          onClick={() => selectView('documents')}
        >
          <FolderOpen size={15} /> Documents
        </button>
        <button
          className={`edu-side-item ${view === 'templates' ? 'active' : ''}`}
          onClick={() => selectView('templates')}
        >
          <Sparkles size={15} /> Templates
          {templates.length > 0 && <span className="edu-side-badge">{templates.length}</span>}
        </button>
        <button className={`edu-side-item ${view === 'schools' ? 'active' : ''}`} onClick={() => selectView('schools')}>
          <Building2 size={15} /> Écoles
        </button>
        <button
          className={`edu-side-item ${view === 'advanced-search' ? 'active' : ''}`}
          onClick={() => selectView('advanced-search')}
        >
          <FileSearch size={15} /> Recherche avancée
        </button>
        <button
          className={`edu-side-item ${view === 'notion-import' ? 'active' : ''}`}
          onClick={() => selectView('notion-import')}
        >
          <Download size={15} /> Import Notion
        </button>
        <button
          className="edu-side-item"
          onClick={() => {
            setSearchOpen(true)
            setSidebarOpen(false)
          }}
        >
          <Search size={15} /> Quickfind
          <span className="edu-side-badge">⌘K</span>
        </button>

        {classes.length > 0 && (
          <ClassesSidebar
            classes={classes}
            onPickClass={(id) => {
              setSelectedClassId(id)
              selectView('classes')
            }}
          />
        )}
      </aside>

      <main className="edu-main" ref={mainRef}>
        {selectedClassId ? (
          <ClassWorkspace
            classId={selectedClassId}
            onClose={() => setSelectedClassId(null)}
            onChanged={async () => {
              await Promise.all([refreshClasses(), refreshDashboard()])
            }}
            templates={templates}
            onTemplatesChanged={refreshTemplates}
          />
        ) : (
          <>
            {classesError && (
              <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
                {classesError}
                <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={refreshClasses}>
                  Réessayer
                </button>
              </div>
            )}
            {view === 'dashboard' && (
              <DashboardView
                dashboard={dashboard}
                selectedSchool={school}
                onChangeSchool={setSchool}
                onOpenClass={(id) => {
                  cockpitScroll.current = { main: mainRef.current?.scrollTop ?? 0, window: window.scrollY }
                  setSelectedClassId(id)
                }}
                onOpenSession={(id) => setCockpitSession({ id, live: false })}
                onOpenCalendarEvent={setCalendarEvent}
                onStartLive={(id) => setCockpitSession({ id, live: true })}
                onStartCorrection={setCorrectionAssignmentId}
                onOpenStudent={openStudentFollowUp}
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
              <SessionsView
                classes={classes}
                /* tous kinds : SessionsView filtre pour le form et transmet tout au drawer/live */
                templates={templates}
                incomingOpenId={pendingSessionId}
                onCloseIncomingOpen={() => setPendingSessionId(null)}
              />
            )}
            {view === 'calendar' && <CalendarView classes={classes} />}
            {view === 'assignments' && (
              <AssignmentsView
                classes={classes}
                templates={templates.filter((t) => t.kind === 'assignment')}
                onChanged={refreshDashboard}
                incomingOpenId={pendingAssignmentId}
                onCloseIncomingOpen={() => setPendingAssignmentId(null)}
                onStartCorrection={(id) => setCorrectionAssignmentId(id)}
              />
            )}
            {view === 'notes' && (
              <NotesView
                classes={classes}
                templates={templates}
                onTemplatesChanged={refreshTemplates}
                incomingOpenId={pendingNoteId}
                onCloseIncomingOpen={() => setPendingNoteId(null)}
              />
            )}
            {view === 'documents' && <DocumentsView classes={classes} />}
            {view === 'templates' && (
              <TemplatesView
                classes={classes}
                onChanged={() => {
                  void refreshTemplates()
                  void refreshClasses()
                  void refreshDashboard()
                }}
              />
            )}
            {view === 'schools' && (
              <SchoolsView
                onOpenClass={(id) => {
                  setSelectedClassId(id)
                  selectView('classes')
                }}
              />
            )}
            {view === 'advanced-search' && (
              <AdvancedSearchView
                onPickClass={(id) => {
                  setSelectedClassId(id)
                  selectView('classes')
                }}
                onPickAssignment={(id) => {
                  setPendingAssignmentId(id)
                  selectView('assignments')
                }}
                onPickSession={(id) => {
                  setPendingSessionId(id)
                  selectView('sessions')
                }}
              />
            )}
          </>
        )}
        {view === 'notion-import' && (
          <NotionImportView
            classes={classes}
            onImported={() => {
              void refreshClasses()
              void refreshDashboard()
            }}
          />
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

      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onPickClass={(id) => {
            setSelectedClassId(id)
            setSearchOpen(false)
            setView('classes')
          }}
          onPickSession={(id) => {
            setPendingSessionId(id)
            setSearchOpen(false)
            setView('sessions')
          }}
          onPickAssignment={(id) => {
            setPendingAssignmentId(id)
            setSearchOpen(false)
            setView('assignments')
          }}
          onPickStudent={async (id) => {
            try {
              const result = await getStudent(id)
              setProfileState({ student: result.student, followUpAlert: null })
              setSearchOpen(false)
            } catch (err) {
              setDashboardError(err instanceof Error ? err.message : 'Impossible d’ouvrir la fiche étudiant')
            }
          }}
          onPickNote={(id) => {
            setPendingNoteId(id)
            setSearchOpen(false)
            setView('notes')
          }}
        />
      )}

      {cockpitSession &&
        (cockpitSession.live ? (
          <SessionLiveMode
            sessionId={cockpitSession.id}
            templates={templates}
            onClose={() => setCockpitSession(null)}
            onChanged={refreshDashboard}
          />
        ) : (
          <SessionDetailDrawer
            sessionId={cockpitSession.id}
            templates={templates}
            onClose={() => setCockpitSession(null)}
            onChanged={refreshDashboard}
          />
        ))}
      {correctionAssignmentId && (
        <CorrectionMode
          assignmentId={correctionAssignmentId}
          onClose={() => setCorrectionAssignmentId(null)}
          onSaved={() => {
            refreshDashboard()
          }}
        />
      )}

      {profileState && (
        <StudentProfileDrawer
          student={profileState.student}
          followUpAlert={profileState.followUpAlert}
          onClose={() => setProfileState(null)}
          onChanged={() => {
            void refreshDashboard()
          }}
        />
      )}

      {calendarEvent && (
        <CalendarEventWorkspaceDrawer
          event={calendarEvent}
          defaultMatch={calendarEvent.match ?? null}
          classes={classes}
          onClose={() => setCalendarEvent(null)}
          onOpenClass={(id) => {
            setCalendarEvent(null)
            setSelectedClassId(id)
            selectView('classes')
          }}
        />
      )}
    </div>
  )
}

/* ─── VENIO-43 — Sidebar « Mes classes » groupée par école ─────────────────
   On agrège par école (en gardant un libellé « Sans école » pour celles qui
   n'en ont pas), on trie les écoles A→Z avec « Sans école » en fin et on
   affiche un compteur par groupe pour la lecture rapide.                    */
function ClassesSidebar({ classes, onPickClass }: { classes: EducationClass[]; onPickClass: (id: string) => void }) {
  const groups = groupClassesBySchool(classes)
  return (
    <>
      <h3>Mes classes</h3>
      {groups.length === 0 && <div className="edu-side-classes-empty">Aucune classe à afficher.</div>}
      {groups.map((group) => (
        <div key={group.key} className="edu-side-school-group">
          <div className="edu-side-school-head">
            <span>{group.label}</span>
            <span
              className="edu-side-school-count"
              aria-label={`${group.classes.length} classe${group.classes.length > 1 ? 's' : ''}`}
            >
              {group.classes.length}
            </span>
          </div>
          {group.classes.map((c) => (
            <button
              key={c._id}
              className="edu-side-item"
              onClick={() => onPickClass(c._id)}
              title={[c.school, c.level, c.program].filter(Boolean).join(' · ') || c.name}
            >
              <span className="edu-side-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}

function groupClassesBySchool(
  classes: EducationClass[],
): Array<{ key: string; label: string; classes: EducationClass[] }> {
  const buckets = new Map<string, { key: string; label: string; classes: EducationClass[] }>()
  for (const c of classes) {
    const trimmed = (c.school || '').trim()
    const key = trimmed.toLowerCase() || '__no_school__'
    const label = trimmed || 'Sans école'
    if (!buckets.has(key)) buckets.set(key, { key, label, classes: [] })
    buckets.get(key)!.classes.push(c)
  }
  // Tri : classes ACTIVE en premier, puis A→Z. École « Sans école » en dernier.
  for (const bucket of buckets.values()) {
    bucket.classes.sort((a, b) => {
      const aActive = a.status === 'ACTIVE' ? 0 : 1
      const bActive = b.status === 'ACTIVE' ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    })
  }
  const arr = Array.from(buckets.values())
  arr.sort((a, b) => {
    if (a.key === '__no_school__') return 1
    if (b.key === '__no_school__') return -1
    return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
  })
  return arr
}
/* DashboardView et Kpi sont extraits dans ./DashboardView.tsx (VENIO-27). */
