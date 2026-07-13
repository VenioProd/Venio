import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  ATTENDANCE_COLOR,
  ATTENDANCE_LABEL,
  SUBMISSION_STATUS_LABEL,
  formatDate,
  getAssignment,
  listAssignments,
  listSessions,
  studentDisplayName,
  updateStudent,
  acknowledgeStudentFollowUp,
  type AttendanceState,
  type EducationAssignment,
  type EducationDashboardAlert,
  type EducationSession,
  type EducationStudent,
  type EducationStudentStatus,
  type EducationSubmission,
} from '../../../services/education'
import { Kpi } from './class-parts'

/**
 * Fiche étudiant — vue transversale : KPIs, notes par devoir,
 * historique de présence et notes libres. Ouverte depuis StudentsTab.
 */

const STUDENT_STATUS_LABEL: Record<EducationStudentStatus, string> = {
  ACTIVE: 'Actif',
  PAUSE: 'En pause',
  ABANDON: 'Abandon',
  TERMINE: 'Terminé',
}

const MAX_SESSIONS_SHOWN = 30
const MAX_ASSIGNMENTS = 20

function idOf(ref: string | { _id: string }): string {
  return typeof ref === 'string' ? ref : ref._id
}

type AttendanceRow = { session: EducationSession; state: AttendanceState }
type GradeRow = { assignment: EducationAssignment; submission: EducationSubmission | null }

export function StudentProfileDrawer({
  student,
  onClose,
  onChanged,
  followUpAlert,
}: {
  student: EducationStudent
  onClose: () => void
  onChanged: () => void
  followUpAlert?: EducationDashboardAlert | null
}) {
  const classId = idOf(student.classId)

  const [status, setStatus] = useState<EducationStudentStatus>(student.status)
  const [notes, setNotes] = useState(student.notes || '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [headError, setHeadError] = useState<string | null>(null)
  const [followUpAcknowledged, setFollowUpAcknowledged] = useState(false)
  const [acknowledgingFollowUp, setAcknowledgingFollowUp] = useState(false)

  // Historique de présence.
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[] | null>(null)
  const [attendanceError, setAttendanceError] = useState<string | null>(null)

  // Notes par devoir.
  const [gradeRows, setGradeRows] = useState<GradeRow[] | null>(null)
  const [gradesError, setGradesError] = useState<string | null>(null)
  const [assignmentsTotal, setAssignmentsTotal] = useState(0)

  const loadAttendance = useCallback(async () => {
    setAttendanceRows(null)
    setAttendanceError(null)
    try {
      const r = await listSessions({ classId })
      const rows = r.sessions
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((session) => {
          const entry = session.attendance.find((a) => idOf(a.studentId) === student._id)
          return entry ? { session, state: entry.state } : null
        })
        .filter((x): x is AttendanceRow => x !== null)
        .slice(0, MAX_SESSIONS_SHOWN)
      setAttendanceRows(rows)
    } catch (err) {
      setAttendanceError(err instanceof Error ? err.message : 'Impossible de charger les séances')
    }
  }, [classId, student._id])

  const loadGrades = useCallback(async () => {
    setGradeRows(null)
    setGradesError(null)
    try {
      const r = await listAssignments({ classId })
      setAssignmentsTotal(r.assignments.length)
      const details = await Promise.all(r.assignments.slice(0, MAX_ASSIGNMENTS).map((a) => getAssignment(a._id)))
      const rows = details.map((d) => ({
        assignment: d.assignment,
        submission: d.submissions.find((s) => idOf(s.studentId) === student._id) ?? null,
      }))
      setGradeRows(rows)
    } catch (err) {
      setGradesError(err instanceof Error ? err.message : 'Impossible de charger les devoirs')
    }
  }, [classId, student._id])

  useEffect(() => {
    loadAttendance()
  }, [loadAttendance])
  useEffect(() => {
    loadGrades()
  }, [loadGrades])

  async function saveStatus(next: EducationStudentStatus) {
    const prev = status
    setStatus(next)
    setHeadError(null)
    try {
      await updateStudent(student._id, { status: next })
      onChanged()
    } catch (err) {
      setStatus(prev)
      setHeadError(err instanceof Error ? err.message : 'Erreur de sauvegarde du statut')
    }
  }

  async function saveNotes() {
    if (notes === (student.notes || '')) return
    setHeadError(null)
    try {
      await updateStudent(student._id, { notes })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 1500)
      onChanged()
    } catch (err) {
      setHeadError(err instanceof Error ? err.message : 'Erreur de sauvegarde des notes')
    }
  }

  async function acknowledgeFollowUp() {
    if (!followUpAlert) return
    setAcknowledgingFollowUp(true)
    setHeadError(null)
    try {
      await acknowledgeStudentFollowUp(student._id, followUpAlert.type, followUpAlert.count)
      setFollowUpAcknowledged(true)
      onChanged()
    } catch (err) {
      setHeadError(err instanceof Error ? err.message : 'Erreur de mise à jour du suivi')
    } finally {
      setAcknowledgingFollowUp(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(720px, 96vw)' }}>
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              {studentDisplayName(student)}
            </h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              {[student.email, student.phone].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <select
              className="edu-select"
              style={{ width: 'auto' }}
              value={status}
              onChange={(e) => saveStatus(e.target.value as EducationStudentStatus)}
              aria-label="Statut de l'étudiant"
            >
              {Object.entries(STUDENT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="edu-drawer-body">
          {headError && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {headError}
            </div>
          )}

          <div className="edu-kpi-grid">
            <Kpi label="Présences" value={student.attendanceCount} />
            <Kpi label="Absences" value={student.absenceCount} />
            <Kpi label="Retards" value={student.lateCount} />
            <Kpi label="Moyenne" value={student.averageGrade != null ? student.averageGrade.toFixed(1) : '—'} />
          </div>

          {followUpAlert && (
            <section className="edu-student-follow-up" aria-labelledby="student-follow-up-title">
              <h2 id="student-follow-up-title" className="edu-h2">
                Point d’attention
              </h2>
              <p className="edu-sub" style={{ marginBottom: 10 }}>
                {followUpAlert.message}
              </p>
              {followUpAcknowledged ? (
                <p className="edu-student-follow-up-done" role="status">
                  Suivi marqué comme traité. Il réapparaîtra si la situation évolue.
                </p>
              ) : (
                <button className="edu-btn ghost" onClick={acknowledgeFollowUp} disabled={acknowledgingFollowUp}>
                  {acknowledgingFollowUp ? 'Mise à jour…' : 'Marquer comme traité'}
                </button>
              )}
            </section>
          )}

          <h2 className="edu-h2">
            Notes par devoir
            {assignmentsTotal > MAX_ASSIGNMENTS && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>
                {' '}
                ({MAX_ASSIGNMENTS} plus récents)
              </span>
            )}
          </h2>
          {gradesError ? (
            <div className="edu-banner-error" role="alert">
              {gradesError}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={loadGrades}>
                Réessayer
              </button>
            </div>
          ) : gradeRows === null ? (
            <p className="edu-sub">Chargement…</p>
          ) : gradeRows.length === 0 ? (
            <div className="edu-empty">Aucun devoir noté.</div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>Devoir</th>
                  <th>Statut</th>
                  <th>Note</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {gradeRows.map(({ assignment, submission }) => (
                  <tr key={assignment._id}>
                    <td>
                      <strong>{assignment.title}</strong>
                      {assignment.deadline && (
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                          {formatDate(assignment.deadline)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="edu-pill">{submission ? SUBMISSION_STATUS_LABEL[submission.status] : '—'}</span>
                    </td>
                    <td>{submission?.grade != null ? `${submission.grade} / ${assignment.maxGrade}` : '—'}</td>
                    <td title={submission?.feedback || undefined} style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {submission?.feedback
                        ? submission.feedback.length > 80
                          ? `${submission.feedback.slice(0, 80)}…`
                          : submission.feedback
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="edu-h2">Historique de présence</h2>
          {attendanceError ? (
            <div className="edu-banner-error" role="alert">
              {attendanceError}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={loadAttendance}>
                Réessayer
              </button>
            </div>
          ) : attendanceRows === null ? (
            <p className="edu-sub">Chargement…</p>
          ) : attendanceRows.length === 0 ? (
            <div className="edu-empty">Aucune séance.</div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Séance</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRows.map(({ session, state }) => (
                  <tr key={session._id}>
                    <td>{formatDate(session.date, true)}</td>
                    <td>{session.title}</td>
                    <td>
                      <span className="edu-pill" style={{ color: ATTENDANCE_COLOR[state] }}>
                        {ATTENDANCE_LABEL[state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="edu-h2">
            Notes libres
            {notesSaved && (
              <span style={{ fontSize: 11.5, fontWeight: 400, color: '#22C55E', marginLeft: 8 }}>Sauvegardé</span>
            )}
          </h2>
          <textarea
            className="edu-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Observations, suivi individuel, points d'attention…"
            style={{ minHeight: 120 }}
            aria-label="Notes libres sur l'étudiant"
          />
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </>
  )
}
