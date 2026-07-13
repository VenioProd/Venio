import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RefreshCw, Save } from 'lucide-react'
import { createNote, getClassCouncilPreparation, type EducationCouncilPreparation } from '../../../services/education'
import { EducationAiDraftPanel } from './EducationAiDraft'

function councilSummary(report: EducationCouncilPreparation): string {
  const { summary } = report
  const grade =
    summary.grades.average == null
      ? 'Aucune moyenne disponible à ce stade.'
      : `Moyenne des ${summary.grades.gradedStudents} étudiant(s) noté(s) : ${summary.grades.average}/20.`
  return [
    `${summary.activeStudents} étudiant(s) actif(s).`,
    `${summary.sessions.completed}/${summary.sessions.total} séance(s) terminée(s), dont ${summary.sessions.withRecap} avec compte-rendu.`,
    `${summary.assignments.open}/${summary.assignments.total} devoir(s) ouvert(s) ou en correction.`,
    `Présences renseignées : ${summary.attendance.recorded} ; absences : ${summary.attendance.absences} ; retards : ${summary.attendance.late}.`,
    grade,
  ].join(' ')
}

/**
 * Le bilan reste d'abord factuel et interne. Le brouillon de conseil ne devient
 * une note que sur une seconde action explicite de l'intervenant.
 */
export function CouncilPreparationPanel({ classId }: { classId: string }) {
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
      setError(err instanceof Error ? err.message : 'Impossible de charger le bilan de classe.')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => (report ? councilSummary(report) : ''), [report])

  async function saveDraft() {
    if (!report || !draft.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createNote({
        title: `Préparation conseil de classe — ${report.class.name}`,
        links: [{ type: 'class', refId: classId }],
        tags: ['conseil-classe'],
        blocks: [
          {
            id: crypto.randomUUID(),
            type: 'heading',
            text: 'Préparation conseil de classe',
            checked: false,
            level: 1,
            meta: {},
          },
          { id: crypto.randomUUID(), type: 'paragraph', text: draft.trim(), checked: false, level: 1, meta: {} },
        ],
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer le brouillon.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="edu-empty">Chargement du bilan de classe…</div>
  if (!report) {
    return (
      <div className="edu-banner-error" role="alert">
        {error || 'Bilan indisponible.'}
        <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => void load()}>
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <section aria-label="Bilan et préparation du conseil de classe">
      <div className="edu-row between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className="edu-h2">
            <FileText size={17} style={{ verticalAlign: 'middle', marginRight: 7 }} />
            Bilan & conseil
          </h2>
          <p className="edu-sub">
            Données internes en lecture seule, mises à jour le{' '}
            {new Date(report.provenance.generatedAt).toLocaleString('fr-FR')}.
          </p>
        </div>
        <button className="edu-btn ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="edu-banner" style={{ marginBottom: 16 }}>
        {summary}
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table className="edu-table">
          <thead>
            <tr>
              <th>Étudiant</th>
              <th>Moyenne</th>
              <th>Abs.</th>
              <th>Retards</th>
              <th>À rendre</th>
              <th>En retard</th>
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
                <td colSpan={6}>Aucun étudiant actif dans cette classe.</td>
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
          <label>Brouillon du conseil, éditable avant enregistrement</label>
          <textarea className="edu-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginTop: 8 }}>
              {error}
            </div>
          )}
          <div className="edu-row" style={{ gap: 10, marginTop: 8 }}>
            <button className="edu-btn" disabled={saving || !draft.trim()} onClick={() => void saveDraft()}>
              <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer dans les notes de la classe'}
            </button>
            {saved && (
              <span className="edu-sub" role="status">
                Note créée. Rien n’a été envoyé ni publié.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
