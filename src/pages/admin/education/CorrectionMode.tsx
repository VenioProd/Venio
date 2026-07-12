import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Save, Download, Plus, Trash2, ChevronDown, ChevronUp, Keyboard, Sparkles } from 'lucide-react'
import './CorrectionMode.css'
import {
  getAssignment,
  updateAssignment,
  bulkUpdateSubmissions,
  downloadAssignmentExport,
  studentDisplayName,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_KIND_LABEL,
  SUBMISSION_STATUS_LABEL,
  type EducationAssignment,
  type EducationSubmission,
  type EducationSubmissionStatus,
  type RubricCriterion,
  type SubmissionBulkUpdate,
} from '../../../services/education'

/**
 * VENIO-30 — Mode correction groupée.
 *
 * Vue : devoir + liste d'étudiants à gauche, panneau correction au centre,
 * barème + snippets à droite. Tout est local en mémoire, on persiste via
 * "Tout enregistrer" (bulk) pour limiter les écritures.
 */

type Draft = {
  studentId: string
  status: EducationSubmissionStatus
  grade: number | null
  feedback: string
  rubricScores: number[]
}

const SAVE_KEY_PREFIX = 'edu-correction-draft-v1:'
const FILTERS_KEY_PREFIX = 'edu-correction-filters-v1:'

function makeDraft(s: EducationSubmission, rubric: RubricCriterion[]): Draft {
  const studentId = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
  // Cherche un barème pré-saisi dans le feedback (format JSON commenté). Par défaut: 0 partout.
  const initialScores = rubric.map(() => 0)
  return {
    studentId,
    status: s.status,
    grade: s.grade,
    feedback: s.feedback || '',
    rubricScores: initialScores,
  }
}

function sumScores(scores: number[]): number {
  return scores.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
}

export function CorrectionMode({
  assignmentId,
  onClose,
  onSaved,
}: {
  assignmentId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [assignment, setAssignment] = useState<EducationAssignment | null>(null)
  const [submissions, setSubmissions] = useState<EducationSubmission[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showRubricEditor, setShowRubricEditor] = useState(false)
  const [snippets, setSnippets] = useState<string[]>([])
  const [rubricDraft, setRubricDraft] = useState<RubricCriterion[]>([])

  const refresh = useCallback(async () => {
    try {
      const r = await getAssignment(assignmentId)
      setAssignment(r.assignment)
      setSubmissions(r.submissions)
      const newDrafts: Record<string, Draft> = {}
      for (const s of r.submissions) {
        const sid = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
        newDrafts[sid] = makeDraft(s, r.assignment.rubric || [])
      }
      // Hydrate local drafts (so user doesn't lose in-progress work between sessions)
      try {
        const stored = localStorage.getItem(SAVE_KEY_PREFIX + assignmentId)
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, Draft>
          for (const [sid, d] of Object.entries(parsed)) {
            if (newDrafts[sid]) newDrafts[sid] = { ...newDrafts[sid], ...d }
          }
        }
      } catch {
        /* corrupt storage */
      }
      setDrafts(newDrafts)
      setSnippets(r.assignment.feedbackSnippets || [])
      setRubricDraft(r.assignment.rubric || [])
      if (!activeStudentId && r.submissions.length > 0) {
        const firstSid =
          typeof r.submissions[0].studentId === 'string' ? r.submissions[0].studentId : r.submissions[0].studentId._id
        setActiveStudentId(firstSid)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la correction')
    }
  }, [assignmentId, activeStudentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILTERS_KEY_PREFIX + assignmentId)
      if (stored === 'all' || stored === 'pending' || stored === 'done') setFilter(stored)
    } catch {
      /* nope */
    }
  }, [assignmentId])

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY_PREFIX + assignmentId, filter)
    } catch {
      /* */
    }
  }, [filter, assignmentId])

  // Auto-save drafts locally for safety (every change).
  useEffect(() => {
    if (Object.keys(drafts).length === 0) return
    try {
      localStorage.setItem(SAVE_KEY_PREFIX + assignmentId, JSON.stringify(drafts))
    } catch {
      /* */
    }
  }, [drafts, assignmentId])

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      const sid = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
      const d = drafts[sid]
      if (!d) return filter === 'all'
      const isDone = d.status === 'CORRIGE' || d.grade != null
      if (filter === 'pending') return !isDone
      if (filter === 'done') return isDone
      return true
    })
  }, [submissions, drafts, filter])

  const stats = useMemo(() => {
    let done = 0
    let total = 0
    let sum = 0
    let count = 0
    for (const s of submissions) {
      const sid = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
      const d = drafts[sid]
      total++
      if (!d) continue
      if (d.status === 'CORRIGE' || d.grade != null) done++
      if (typeof d.grade === 'number') {
        sum += d.grade
        count++
      }
    }
    return { done, total, avg: count > 0 ? Number((sum / count).toFixed(2)) : null }
  }, [submissions, drafts])

  const activeSubmission = useMemo(
    () =>
      submissions.find((s) => (typeof s.studentId === 'string' ? s.studentId : s.studentId._id) === activeStudentId) ||
      null,
    [submissions, activeStudentId],
  )
  const activeDraft = activeStudentId ? drafts[activeStudentId] : null

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!filtered.length) return
      const idx = filtered.findIndex(
        (s) => (typeof s.studentId === 'string' ? s.studentId : s.studentId._id) === activeStudentId,
      )
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filtered[(idx + 1) % filtered.length]
        const sid = typeof next.studentId === 'string' ? next.studentId : next.studentId._id
        setActiveStudentId(sid)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const next = filtered[(idx - 1 + filtered.length) % filtered.length]
        const sid = typeof next.studentId === 'string' ? next.studentId : next.studentId._id
        setActiveStudentId(sid)
      } else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void saveAll()
      } else if (e.key === '?') {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, activeStudentId])

  function patchDraft(studentId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }))
  }

  function applyRubric(studentId: string, scores: number[]) {
    const grade = sumScores(scores)
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], rubricScores: scores, grade },
    }))
  }

  function applyQuickAction(action: 'all-rendu' | 'all-corrige-zero' | 'mark-absent-non-rendu') {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const s of submissions) {
        const sid = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
        const d = next[sid]
        if (!d) continue
        if (action === 'all-rendu' && d.status === 'NON_RENDU') {
          next[sid] = { ...d, status: 'RENDU' }
        } else if (action === 'all-corrige-zero' && d.grade == null) {
          next[sid] = { ...d, grade: 0, status: 'CORRIGE' }
        } else if (action === 'mark-absent-non-rendu' && d.status === 'NON_RENDU') {
          next[sid] = { ...d, status: 'NON_VALIDE' }
        }
      }
      return next
    })
  }

  function appendSnippet(text: string) {
    if (!activeStudentId) return
    const current = drafts[activeStudentId]?.feedback || ''
    const next = current ? `${current}\n${text}` : text
    patchDraft(activeStudentId, { feedback: next })
  }

  async function saveSnippets(next: string[]) {
    if (!assignment) return
    try {
      await updateAssignment(assignment._id, { feedbackSnippets: next })
      setSnippets(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function saveRubric() {
    if (!assignment) return
    const cleaned = rubricDraft
      .filter((r) => r.label.trim())
      .map((r) => ({ label: r.label.trim(), max: Math.max(0, Number(r.max) || 0) }))
    try {
      const r = await updateAssignment(assignment._id, { rubric: cleaned })
      setAssignment(r.assignment)
      // Reset draft rubric scores to match new criteria length
      setDrafts((prev) => {
        const next: Record<string, Draft> = {}
        for (const [sid, d] of Object.entries(prev)) {
          const scores = cleaned.map((_, i) => d.rubricScores[i] ?? 0)
          next[sid] = { ...d, rubricScores: scores }
        }
        return next
      })
      setShowRubricEditor(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function saveAll() {
    if (!assignment) return
    setSaving(true)
    setError(null)
    try {
      const updates: SubmissionBulkUpdate[] = Object.values(drafts).map((d) => ({
        studentId: d.studentId,
        status: d.status,
        grade: d.grade,
        feedback: d.feedback,
      }))
      const r = await bulkUpdateSubmissions(assignment._id, updates)
      setLastSavedAt(Date.now())
      try {
        localStorage.removeItem(SAVE_KEY_PREFIX + assignmentId)
      } catch {
        /* */
      }
      if (onSaved) onSaved()
      if (r.updated > 0) {
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  if (!assignment) {
    return (
      <div className="edu-correction-overlay">
        <div className="edu-correction-loading">Chargement…</div>
      </div>
    )
  }

  return (
    <div className="edu-correction-overlay" role="dialog" aria-label="Mode correction">
      <div className="edu-correction-toolbar">
        <div className="edu-correction-toolbar-left">
          <button className="edu-btn-icon" onClick={onClose} title="Fermer (Esc)">
            <X size={18} />
          </button>
          <div>
            <h2 className="edu-correction-title">{assignment.title}</h2>
            <div className="edu-correction-subtitle">
              {ASSIGNMENT_KIND_LABEL[assignment.kind]} · {ASSIGNMENT_STATUS_LABEL[assignment.status]} · /
              {assignment.maxGrade}
              {' · '}
              <strong>
                {stats.done}/{stats.total}
              </strong>{' '}
              corrigés
              {stats.avg != null && (
                <>
                  {' '}
                  · moy. <strong>{stats.avg}</strong>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="edu-correction-toolbar-right">
          <button
            className="edu-btn ghost"
            onClick={() =>
              void downloadAssignmentExport(assignment._id).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Impossible d’exporter les corrections')
              })
            }
            title="Télécharger les corrections en CSV"
          >
            <Download size={14} /> Export CSV
          </button>
          <button className="edu-btn ghost" onClick={() => setShowShortcuts((v) => !v)} title="Raccourcis clavier">
            <Keyboard size={14} />
          </button>
          <button className="edu-btn" disabled={saving} onClick={saveAll}>
            <Save size={14} /> {saving ? 'Enregistrement…' : 'Tout enregistrer'}
          </button>
        </div>
      </div>

      {error && (
        <div className="edu-banner-error" style={{ margin: '0 16px 8px' }}>
          {error}
          <button className="edu-btn ghost" style={{ marginLeft: 12 }} onClick={() => setError(null)}>
            Fermer
          </button>
        </div>
      )}
      {lastSavedAt && !error && (
        <div className="edu-correction-saved-toast" aria-live="polite">
          Enregistré ✓
        </div>
      )}

      {showShortcuts && (
        <div className="edu-correction-shortcuts">
          <strong>Raccourcis :</strong> J/↓ suivant · K/↑ précédent · ⌘/Ctrl+S enregistrer · Esc fermer · ? aide
        </div>
      )}

      <div className="edu-correction-body">
        <aside className="edu-correction-list">
          <div className="edu-correction-filters">
            {(
              [
                ['pending', 'À corriger'],
                ['done', 'Corrigés'],
                ['all', 'Tous'],
              ] as Array<['pending' | 'done' | 'all', string]>
            ).map(([k, l]) => (
              <button
                key={k}
                className={`edu-correction-filter ${filter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="edu-correction-quick-actions">
            <button className="edu-correction-quick" onClick={() => applyQuickAction('all-rendu')}>
              Tous → Rendu
            </button>
            <button className="edu-correction-quick" onClick={() => applyQuickAction('mark-absent-non-rendu')}>
              Non rendus → Non validé
            </button>
            <button className="edu-correction-quick" onClick={() => applyQuickAction('all-corrige-zero')}>
              Mettre 0 si non noté
            </button>
          </div>
          <div className="edu-correction-list-items">
            {filtered.length === 0 && (
              <div className="edu-empty edu-empty-compact" style={{ padding: 14 }}>
                Tout est traité ici. Bascule le filtre pour voir les autres.
              </div>
            )}
            {filtered.map((s) => {
              const sid = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
              const stu = typeof s.studentId === 'string' ? null : s.studentId
              const d = drafts[sid]
              const isActive = sid === activeStudentId
              const grade = d?.grade
              const status = d?.status ?? s.status
              return (
                <button
                  key={s._id}
                  className={`edu-correction-row ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveStudentId(sid)}
                >
                  <div className="edu-correction-row-name">{stu ? studentDisplayName(stu) : '—'}</div>
                  <div className="edu-correction-row-meta">
                    <span className="edu-pill">{SUBMISSION_STATUS_LABEL[status]}</span>
                    <span className="edu-correction-row-grade">
                      {grade != null ? `${grade}/${assignment.maxGrade}` : '—'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="edu-correction-panel">
          {!activeDraft || !activeSubmission ? (
            <div className="edu-empty">Sélectionne un étudiant à corriger.</div>
          ) : (
            <CorrectionPanel
              assignment={assignment}
              submission={activeSubmission}
              draft={activeDraft}
              onChange={(patch) => patchDraft(activeDraft.studentId, patch)}
              onApplyRubric={(scores) => applyRubric(activeDraft.studentId, scores)}
            />
          )}
        </section>

        <aside className="edu-correction-side">
          <div className="edu-correction-side-block">
            <div className="edu-correction-side-head">
              <strong>Barème</strong>
              <button className="edu-btn ghost" onClick={() => setShowRubricEditor((v) => !v)}>
                {showRubricEditor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {assignment.rubric.length ? 'Éditer' : 'Configurer'}
              </button>
            </div>
            {showRubricEditor ? (
              <div className="edu-correction-rubric-editor">
                {rubricDraft.map((r, i) => (
                  <div key={i} className="edu-correction-rubric-row">
                    <input
                      className="edu-input"
                      value={r.label}
                      placeholder="Critère"
                      onChange={(e) => {
                        const next = [...rubricDraft]
                        next[i] = { ...next[i], label: e.target.value }
                        setRubricDraft(next)
                      }}
                    />
                    <input
                      className="edu-input"
                      type="number"
                      min={0}
                      step={0.5}
                      value={r.max}
                      style={{ width: 80 }}
                      onChange={(e) => {
                        const next = [...rubricDraft]
                        next[i] = { ...next[i], max: Number(e.target.value) || 0 }
                        setRubricDraft(next)
                      }}
                    />
                    <button
                      className="edu-btn-icon"
                      onClick={() => setRubricDraft(rubricDraft.filter((_, j) => j !== i))}
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <div className="edu-row" style={{ gap: 6, marginTop: 6 }}>
                  <button
                    className="edu-btn ghost"
                    onClick={() => setRubricDraft([...rubricDraft, { label: '', max: 0 }])}
                  >
                    <Plus size={13} /> Critère
                  </button>
                  <span className="edu-correction-rubric-sum">
                    Total : {rubricDraft.reduce((acc, r) => acc + (Number(r.max) || 0), 0)} / {assignment.maxGrade}
                  </span>
                </div>
                <div className="edu-row" style={{ gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                  <button
                    className="edu-btn ghost"
                    onClick={() => {
                      setRubricDraft(assignment.rubric)
                      setShowRubricEditor(false)
                    }}
                  >
                    Annuler
                  </button>
                  <button className="edu-btn" onClick={saveRubric}>
                    Enregistrer le barème
                  </button>
                </div>
              </div>
            ) : assignment.rubric.length === 0 ? (
              <div className="edu-correction-rubric-empty">
                Pas de barème. Ajoute des critères (ex. méthode, contenu, forme) pour noter par sous-totaux.
              </div>
            ) : (
              <div className="edu-correction-rubric-summary">
                {assignment.rubric.map((c, i) => (
                  <div key={i} className="edu-correction-rubric-summary-row">
                    <span>{c.label}</span>
                    <span className="edu-correction-rubric-summary-max">/ {c.max}</span>
                  </div>
                ))}
                <div className="edu-correction-rubric-summary-row total">
                  <span>Total</span>
                  <span>
                    {assignment.rubric.reduce((acc, c) => acc + c.max, 0)} / {assignment.maxGrade}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="edu-correction-side-block">
            <div className="edu-correction-side-head">
              <strong>Snippets feedback</strong>
              <Sparkles size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
            <SnippetsEditor
              snippets={snippets}
              onApply={appendSnippet}
              onSave={saveSnippets}
              disabled={!activeStudentId}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function CorrectionPanel({
  assignment,
  submission,
  draft,
  onChange,
  onApplyRubric,
}: {
  assignment: EducationAssignment
  submission: EducationSubmission
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onApplyRubric: (scores: number[]) => void
}) {
  const stu = typeof submission.studentId === 'string' ? null : submission.studentId
  const rubricLen = assignment.rubric.length
  const safeScores = useMemo(() => {
    if (draft.rubricScores.length === rubricLen) return draft.rubricScores
    return assignment.rubric.map((_, i) => draft.rubricScores[i] ?? 0)
  }, [draft.rubricScores, assignment.rubric, rubricLen])

  return (
    <div>
      <div className="edu-correction-student">
        <h3 className="edu-correction-student-name">{stu ? studentDisplayName(stu) : '—'}</h3>
        <div className="edu-correction-student-meta">
          {submission.submittedAt && `Rendu ${new Date(submission.submittedAt).toLocaleDateString('fr-FR')}`}
          {submission.isLate && (
            <span className="edu-pill" style={{ marginLeft: 8, background: 'rgba(245,158,11,0.15)', color: '#FBBF24' }}>
              En retard
            </span>
          )}
        </div>
      </div>

      {submission.url && (
        <div className="edu-correction-link">
          <a href={submission.url} target="_blank" rel="noopener noreferrer">
            {submission.url}
          </a>
        </div>
      )}
      {submission.textBody && <div className="edu-correction-body-text">{submission.textBody}</div>}

      <div className="edu-correction-row-controls">
        <div className="edu-form-group">
          <label>Statut</label>
          <select
            className="edu-select"
            value={draft.status}
            onChange={(e) => onChange({ status: e.target.value as EducationSubmissionStatus })}
          >
            {Object.entries(SUBMISSION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="edu-form-group">
          <label>Note (/{assignment.maxGrade})</label>
          <input
            type="number"
            className="edu-input"
            min={0}
            max={assignment.maxGrade}
            step={0.5}
            value={draft.grade ?? ''}
            onChange={(e) =>
              onChange({
                grade: e.target.value === '' ? null : Number(e.target.value),
                status: e.target.value === '' ? draft.status : 'CORRIGE',
              })
            }
            style={{ width: 110 }}
          />
        </div>
      </div>

      {assignment.rubric.length > 0 && (
        <div className="edu-correction-rubric-input">
          <div className="edu-correction-side-head">
            <strong>Barème détaillé</strong>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              Total : {sumScores(safeScores)} / {assignment.rubric.reduce((acc, c) => acc + c.max, 0)}
            </span>
          </div>
          {assignment.rubric.map((c, i) => (
            <div key={i} className="edu-correction-rubric-input-row">
              <label>{c.label}</label>
              <input
                type="number"
                className="edu-input"
                min={0}
                max={c.max}
                step={0.5}
                value={safeScores[i] ?? 0}
                onChange={(e) => {
                  const next = [...safeScores]
                  next[i] = Math.min(Math.max(Number(e.target.value) || 0, 0), c.max)
                  onApplyRubric(next)
                }}
                style={{ width: 80 }}
              />
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>/ {c.max}</span>
            </div>
          ))}
        </div>
      )}

      <div className="edu-form-group" style={{ marginTop: 12 }}>
        <label>Feedback</label>
        <textarea
          className="edu-textarea"
          value={draft.feedback}
          rows={8}
          onChange={(e) => onChange({ feedback: e.target.value })}
          placeholder="Retour personnalisé à l'étudiant…"
        />
      </div>
    </div>
  )
}

function SnippetsEditor({
  snippets,
  onApply,
  onSave,
  disabled,
}: {
  snippets: string[]
  onApply: (text: string) => void
  onSave: (next: string[]) => void
  disabled?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  return (
    <div className="edu-correction-snippets">
      {snippets.length === 0 && !adding && (
        <div className="edu-correction-snippets-empty">
          Aucun snippet. Crée des phrases-clés réutilisables : "À retravailler", "Argumentation à étoffer"…
        </div>
      )}
      {snippets.map((s, i) => (
        <div key={i} className="edu-correction-snippet">
          <button
            className="edu-correction-snippet-apply"
            disabled={disabled}
            onClick={() => onApply(s)}
            title="Coller dans le feedback de l'étudiant actif"
          >
            {s}
          </button>
          <button
            className="edu-btn-icon"
            onClick={() => onSave(snippets.filter((_, j) => j !== i))}
            aria-label="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="edu-correction-snippet-form">
          <textarea
            className="edu-textarea"
            value={draft}
            autoFocus
            rows={2}
            placeholder="Texte du snippet"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="edu-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="edu-btn ghost"
              onClick={() => {
                setAdding(false)
                setDraft('')
              }}
            >
              Annuler
            </button>
            <button
              className="edu-btn"
              disabled={!draft.trim()}
              onClick={() => {
                onSave([...snippets, draft.trim()])
                setAdding(false)
                setDraft('')
              }}
            >
              Ajouter
            </button>
          </div>
        </div>
      ) : (
        <button className="edu-btn ghost edu-correction-snippet-add" onClick={() => setAdding(true)}>
          <Plus size={13} /> Ajouter un snippet
        </button>
      )}
    </div>
  )
}
