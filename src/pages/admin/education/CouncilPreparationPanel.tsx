import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RefreshCw, Save } from 'lucide-react'
import { createNote, getClassCouncilPreparation, type EducationCouncilPreparation } from '../../../services/education'
import { useI18n } from '../../../context/I18nContext'
import { formatDateTime } from '../../../i18n/format'
import { translate } from '../../../i18n'
import { EducationAiDraftPanel } from './EducationAiDraft'

function councilSummary(report: EducationCouncilPreparation): string {
  const { summary } = report
  const grade =
    summary.grades.average == null
      ? translate('eduD.council.noAverage')
      : translate('eduD.council.average', {
          count: summary.grades.gradedStudents,
          average: summary.grades.average,
        })
  return [
    translate('eduD.council.activeStudents', { count: summary.activeStudents }),
    translate('eduD.council.sessions', {
      completed: summary.sessions.completed,
      total: summary.sessions.total,
      withRecap: summary.sessions.withRecap,
    }),
    translate('eduD.council.assignments', { open: summary.assignments.open, total: summary.assignments.total }),
    translate('eduD.council.attendance', {
      recorded: summary.attendance.recorded,
      absences: summary.attendance.absences,
      late: summary.attendance.late,
    }),
    grade,
  ].join(' ')
}

/**
 * Le bilan reste d'abord factuel et interne. Le brouillon de conseil ne devient
 * une note que sur une seconde action explicite de l'intervenant.
 */
export function CouncilPreparationPanel({ classId }: { classId: string }) {
  const { t } = useI18n()
  const [report, setReport] = useState<EducationCouncilPreparation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await getClassCouncilPreparation(classId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduD.council.loadError'))
    } finally {
      setLoading(false)
    }
  }, [classId, t])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => (report ? councilSummary(report) : ''), [report, t])

  async function saveDraft() {
    if (!report || !draft.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createNote({
        title: t('eduD.council.noteTitle', { name: report.class.name }),
        links: [{ type: 'class', refId: classId }],
        tags: ['conseil-classe'],
        blocks: [
          {
            id: crypto.randomUUID(),
            type: 'heading',
            text: t('eduD.council.noteHeading'),
            checked: false,
            level: 1,
            meta: {},
          },
          { id: crypto.randomUUID(), type: 'paragraph', text: draft.trim(), checked: false, level: 1, meta: {} },
        ],
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduD.council.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="edu-empty">{t('eduD.council.loading')}</div>
  if (!report) {
    return (
      <div className="edu-banner-error" role="alert">
        {error || t('eduD.council.unavailable')}
        <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => void load()}>
          {t('eduD.common.retry')}
        </button>
      </div>
    )
  }

  return (
    <section aria-label={t('eduD.council.sectionAria')}>
      <div className="edu-row between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className="edu-h2">
            <FileText size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            {t('eduD.council.heading')}
          </h2>
          <p className="edu-sub">
            {t('eduD.council.readOnly', {
              date: formatDateTime(report.provenance.generatedAt, {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
              }),
            })}
          </p>
        </div>
        <button className="edu-btn ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {t('eduD.council.refresh')}
        </button>
      </div>

      <div className="edu-banner" style={{ marginBottom: 16 }}>
        {summary}
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table className="edu-table">
          <thead>
            <tr>
              <th>{t('eduD.council.colStudent')}</th>
              <th>{t('eduD.council.colAverage')}</th>
              <th>{t('eduD.council.colAbsences')}</th>
              <th>{t('eduD.council.colLates')}</th>
              <th>{t('eduD.council.colPending')}</th>
              <th>{t('eduD.council.colLateAssignments')}</th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((student) => (
              <tr key={student._id}>
                <td>
                  {student.firstName} {student.lastName}
                </td>
                <td>{student.averageGrade == null ? '—' : `${student.averageGrade}/20`}</td>
                <td>{student.absenceCount}</td>
                <td>{student.lateCount}</td>
                <td>{student.pendingAssignments}</td>
                <td>{student.lateAssignments}</td>
              </tr>
            ))}
            {report.students.length === 0 && (
              <tr>
                <td colSpan={6}>{t('eduD.council.noStudents')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EducationAiDraftPanel
        mode="class_council_prep"
        councilSummary={{ className: report.class.name, summary }}
        onApply={(result) => {
          const text = result.fields.councilPrep
          if (typeof text === 'string') {
            setDraft(text)
            setSaved(false)
          }
        }}
      />

      {draft && (
        <div className="edu-form-group" style={{ marginTop: 16 }}>
          <label>{t('eduD.council.draftLabel')}</label>
          <textarea className="edu-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div className="edu-row" style={{ gap: 10, marginTop: 8 }}>
            <button className="edu-btn" disabled={saving || !draft.trim()} onClick={() => void saveDraft()}>
              <Save size={14} /> {saving ? t('eduD.council.saving') : t('eduD.council.save')}
            </button>
            {saved && (
              <span className="edu-sub" role="status">
                {t('eduD.council.saved')}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
