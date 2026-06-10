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
import { DashboardView } from './DashboardView'
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { TemplatesView } from './TemplatesView'
import { CorrectionMode } from './CorrectionMode'
import { AdvancedSearchView } from './AdvancedSearchView'
import { SchoolsView } from './SchoolsView'
import { CalendarView } from './CalendarView'
import { Building2, FileSearch, CalendarDays } from 'lucide-react'
import './EducationWorkspace.css'
import { Kpi, ClassesView, ClassFormDrawer } from './class-parts'
import { ClassWorkspace } from './ClassWorkspace'
import { SessionsView } from './session-parts'
import { AssignmentsView } from './assignment-parts'
import { NotesView } from './note-parts'
import { SearchModal } from './search-parts'

type View =
  | 'dashboard'
  | 'classes'
  | 'sessions'
  | 'assignments'
  | 'notes'
  | 'templates'
  | 'search'
  | 'advanced-search'
  | 'schools'
  | 'calendar'

export default function EducationWorkspace() {
  const [view, setView] = useState<View>('dashboard')
  const [dashboard, setDashboard] = useState<EducationDashboard | null>(null)
  const [classes, setClasses] = useState<EducationClass[]>([])
  const [templates, setTemplates] = useState<EducationTemplate[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [showCreateClass, setShowCreateClass] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [correctionAssignmentId, setCorrectionAssignmentId] = useState<string | null>(null)
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
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

      <aside className={`edu-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <h3>Espace pédagogique</h3>
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
          <>
            <h3>Mes classes</h3>
            {classes.slice(0, 12).map((c) => (
              <button
                key={c._id}
                className="edu-side-item"
                onClick={() => {
                  setSelectedClassId(c._id)
                  selectView('classes')
                }}
              >
                <span className="edu-side-dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </>
        )}
      </aside>

      <main className="edu-main">
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
                  setSelectedClassId(id)
                  selectView('classes')
                }}
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
                templates={templates.filter((t) => t.kind === 'session')}
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
              <NotesView classes={classes} templates={templates} onTemplatesChanged={refreshTemplates} />
            )}
            {view === 'templates' && <TemplatesView />}
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
        />
      )}

      {correctionAssignmentId && (
        <CorrectionMode
          assignmentId={correctionAssignmentId}
          onClose={() => setCorrectionAssignmentId(null)}
          onSaved={() => {
            refreshDashboard()
          }}
        />
      )}
    </div>
  )
}

/* DashboardView et Kpi sont extraits dans ./DashboardView.tsx (VENIO-27). */
