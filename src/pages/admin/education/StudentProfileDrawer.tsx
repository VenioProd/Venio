import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  ATTENDANCE_COLOR,
  ATTENDANCE_LABEL,
  SUBMISSION_STATUS_LABEL,
  formatDate,
  getStudentOverview,
  studentDisplayName,
  updateStudent,
  acknowledgeStudentFollowUp,
  type EducationDashboardAlert,
  type EducationStudent,
  type EducationStudentStatus,
  type EducationStudentOverview,
} from '../../../services/education'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { Kpi } from './class-parts'

/**
 * Fiche étudiant — vue transversale : KPIs, notes par devoir,
 * historique de présence et notes libres. Ouverte depuis StudentsTab.
 */

const STUDENT_STATUS_LABEL_KEYS = {
  ACTIVE: 'eduD.studentStatus.active',
  PAUSE: 'eduD.studentStatus.pause',
  ABANDON: 'eduD.studentStatus.dropped',
  TERMINE: 'eduD.studentStatus.ended',
} as const satisfies Record<EducationStudentStatus, MessageKey>

const MAX_SESSIONS_SHOWN = 30
const MAX_ASSIGNMENTS = 20

type AttendanceRow = EducationStudentOverview['attendance'][number]
type GradeRow = EducationStudentOverview['grades'][number]

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
  const { t } = useI18n()
  const [status, setStatus] = useState<EducationStudentStatus>(student.status)
  const [notes, setNotes] = useState(student.notes || '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [headError, setHeadError] = useState<string | null>(null)
  const [followUpAcknowledged, setFollowUpAcknowledged] = useState(false)
  const [acknowledgingFollowUp, setAcknowledgingFollowUp] = useState(false)

  // Historique de présence.
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[] | null>(null)
  const [attendanceError, setAttendanceError] = useState<string | null>(null)
  const [attendanceTotal, setAttendanceTotal] = useState(0)

  // Notes par devoir.
  const [gradeRows, setGradeRows] = useState<GradeRow[] | null>(null)
  const [gradesError, setGradesError] = useState<string | null>(null)
  const [assignmentsTotal, setAssignmentsTotal] = useState(0)

  const loadOverview = useCallback(async () => {
    try {
      const overview = await getStudentOverview(student._id)
      setAttendanceError(null)
      setGradesError(null)
      setAttendanceRows(overview.attendance)
      setAttendanceTotal(overview.attendanceTotal)
      setGradeRows(overview.grades)
      setAssignmentsTotal(overview.assignmentsTotal)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('eduD.profile.loadError')
      setAttendanceError(message)
      setGradesError(message)
    }
  }, [student._id, t])

  useEffect(() => {
    // The drawer must refresh when its student changes; state updates happen after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview()
  }, [loadOverview])

  async function saveStatus(next: EducationStudentStatus) {
    const prev = status
    setStatus(next)
    setHeadError(null)
    try {
      await updateStudent(student._id, { status: next })
      onChanged()
    } catch (err) {
      setStatus(prev)
      setHeadError(err instanceof Error ? err.message : t('eduD.profile.saveStatusError'))
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
      setHeadError(err instanceof Error ? err.message : t('eduD.profile.saveNotesError'))
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
      setHeadError(err instanceof Error ? err.message : t('eduD.profile.followUpError'))
    } finally {
      setAcknowledgingFollowUp(false)
    }
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div
        className="edu-drawer"
        style={{ width: 'min(720px, 96vw)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-profile-title"
      >
        <div className="edu-drawer-head">
          <div>
            <h2 id="student-profile-title" className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
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
              aria-label={t('eduD.profile.statusAria')}
            >
              {(Object.keys(STUDENT_STATUS_LABEL_KEYS) as EducationStudentStatus[]).map((k) => (
                <option key={k} value={k}>
                  {t(STUDENT_STATUS_LABEL_KEYS[k])}
                </option>
              ))}
            </select>
            <button className="edu-btn-icon" onClick={onClose} aria-label={t('eduD.profile.closeAria')}>
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
            <Kpi label={t('eduD.profile.kpiAttendance')} value={student.attendanceCount} />
            <Kpi label={t('eduD.profile.kpiAbsences')} value={student.absenceCount} />
            <Kpi label={t('eduD.profile.kpiLates')} value={student.lateCount} />
            <Kpi
              label={t('eduD.profile.kpiAverage')}
              value={student.averageGrade != null ? student.averageGrade.toFixed(1) : '—'}
            />
          </div>

          {followUpAlert && (
            <section className="edu-student-follow-up" aria-labelledby="student-follow-up-title">
              <h2 id="student-follow-up-title" className="edu-h2">
                {t('eduD.profile.attention')}
              </h2>
              <p className="edu-sub" style={{ marginBottom: 10 }}>
                {followUpAlert.message}
              </p>
              {followUpAcknowledged ? (
                <p className="edu-student-follow-up-done" role="status">
                  {t('eduD.profile.followUpDone')}
                </p>
              ) : (
                <button className="edu-btn ghost" onClick={acknowledgeFollowUp} disabled={acknowledgingFollowUp}>
                  {acknowledgingFollowUp ? t('eduD.profile.updating') : t('eduD.profile.markDone')}
                </button>
              )}
            </section>
          )}

          <h2 className="edu-h2">
            {t('eduD.profile.gradesHeading')}
            {assignmentsTotal > MAX_ASSIGNMENTS && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>
                {' '}
                {t('eduD.profile.mostRecentMasc', { count: MAX_ASSIGNMENTS })}
              </span>
            )}
          </h2>
          {gradesError ? (
            <div className="edu-banner-error" role="alert">
              {gradesError}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={loadOverview}>
                {t('eduD.common.retry')}
              </button>
            </div>
          ) : gradeRows === null ? (
            <p className="edu-sub">{t('eduD.common.loading')}</p>
          ) : gradeRows.length === 0 ? (
            <div className="edu-empty">{t('eduD.profile.noGraded')}</div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>{t('eduD.profile.colAssignment')}</th>
                  <th>{t('eduD.common.status')}</th>
                  <th>{t('eduD.profile.colGrade')}</th>
                  <th>{t('eduD.profile.colFeedback')}</th>
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

          <h2 className="edu-h2">
            {t('eduD.profile.attendanceHeading')}
            {attendanceTotal > MAX_SESSIONS_SHOWN && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>
                {' '}
                {t('eduD.profile.mostRecentFem', { count: MAX_SESSIONS_SHOWN })}
              </span>
            )}
          </h2>
          {attendanceError ? (
            <div className="edu-banner-error" role="alert">
              {attendanceError}
              <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={loadOverview}>
                {t('eduD.common.retry')}
              </button>
            </div>
          ) : attendanceRows === null ? (
            <p className="edu-sub">{t('eduD.common.loading')}</p>
          ) : attendanceRows.length === 0 ? (
            <div className="edu-empty">{t('eduD.profile.noSessions')}</div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>{t('eduD.profile.colDate')}</th>
                  <th>{t('eduD.profile.colSession')}</th>
                  <th>{t('eduD.profile.colState')}</th>
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
            {t('eduD.profile.freeNotes')}
            {notesSaved && (
              <span style={{ fontSize: 11.5, fontWeight: 400, color: '#22C55E', marginLeft: 8 }}>
                {t('eduD.profile.saved')}
              </span>
            )}
          </h2>
          <textarea
            className="edu-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder={t('eduD.profile.notesPlaceholder')}
            style={{ minHeight: 120 }}
            aria-label={t('eduD.profile.notesAria')}
          />
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </>
  )
}
