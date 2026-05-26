import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  getAssignment,
  updateAssignment,
  updateSubmission,
  studentDisplayName,
  formatDate,
  assignmentExportUrl,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_KIND_LABEL,
  SUBMISSION_STATUS_LABEL,
  type EducationAssignment,
  type EducationAssignmentStatus,
  type EducationSubmission,
} from '@/services/education'
import { Kpi } from './shared'

export default function AssignmentDetailDrawer({
  assignmentId,
  onClose,
  onChanged,
  onStartCorrection,
}: {
  assignmentId: string
  onClose: () => void
  onChanged: () => void
  onStartCorrection?: (id: string) => void
}) {
  const [data, setData] = useState<{
    assignment: EducationAssignment
    submissions: EducationSubmission[]
    stats: {
      total: number
      rendu: number
      corrige: number
      nonRendu: number
      retard: number
      moyenne: number | null
    }
  } | null>(null)

  const refresh = useCallback(async () => {
    setData(await getAssignment(assignmentId))
  }, [assignmentId])
  useEffect(() => {
    refresh()
  }, [refresh])

  if (!data) return null
  const { assignment, submissions, stats } = data

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              {assignment.title}
            </h2>
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
              onChange={async e => {
                await updateAssignment(assignmentId, {
                  status: e.target.value as EducationAssignmentStatus,
                })
                await refresh()
                onChanged()
              }}
            >
              {Object.entries(ASSIGNMENT_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {onStartCorrection && (
              <button
                className="edu-btn"
                onClick={() => onStartCorrection(assignmentId)}
                title="Ouvrir le mode correction groupée"
              >
                Mode correction
              </button>
            )}
            <a
              className="edu-btn ghost"
              href={assignmentExportUrl(assignmentId)}
              target="_blank"
              rel="noopener"
              title="Exporter les corrections en CSV"
            >
              Export CSV
            </a>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-kpi-grid">
            <Kpi label="Rendus" value={`${stats.rendu} / ${stats.total}`} />
            <Kpi label="En retard" value={stats.retard} />
            <Kpi label="Corrigés" value={stats.corrige} />
            <Kpi
              label="Moyenne"
              value={stats.moyenne != null ? stats.moyenne : '—'}
              sub={`/ ${assignment.maxGrade}`}
            />
          </div>

          {assignment.instructions && (
            <>
              <h2 className="edu-h2">Consignes</h2>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 13.5,
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: 12,
                  borderRadius: 8,
                }}
              >
                {assignment.instructions}
              </div>
            </>
          )}

          <h2 className="edu-h2">Suivi par étudiant</h2>
          {submissions.length === 0 ? (
            <div className="edu-empty">
              Le devoir est encore en brouillon. Passe-le à <strong>Ouvert</strong> pour créer
              les soumissions.
            </div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Statut</th>
                  <th>Note</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => {
                  const stu = typeof s.studentId === 'string' ? null : s.studentId
                  return (
                    <tr key={s._id}>
                      <td>{stu ? studentDisplayName(stu) : '—'}</td>
                      <td>
                        <select
                          className="edu-select"
                          style={{ width: 'auto', minWidth: 130 }}
                          value={s.status}
                          onChange={async e => {
                            const studentId =
                              typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            await updateSubmission(assignmentId, studentId, {
                              status: e.target.value as EducationSubmission['status'],
                            })
                            await refresh()
                          }}
                        >
                          {Object.entries(SUBMISSION_STATUS_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
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
                          onChange={async e => {
                            const studentId =
                              typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            await updateSubmission(assignmentId, studentId, {
                              grade: v,
                              status: v != null ? 'CORRIGE' : s.status,
                            })
                            await refresh()
                            onChanged()
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="edu-input"
                          style={{ minWidth: 200 }}
                          value={s.feedback}
                          placeholder="Feedback…"
                          onBlur={async e => {
                            const studentId =
                              typeof s.studentId === 'string' ? s.studentId : s.studentId._id
                            if (e.target.value !== s.feedback) {
                              await updateSubmission(assignmentId, studentId, {
                                feedback: e.target.value,
                              })
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
