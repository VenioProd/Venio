/**
 * Composants internes extraits de `education/index.tsx` pour passer sous 800 lignes.
 *
 * NOTE : ce fichier dépasse lui-même 800 lignes (issue de découpage à faire dans
 * un follow-up — voir issue #87). Un découpage par domaine (classes/students/
 * sessions/assignments/notes) est suggéré pour atteindre le DOD strict.
 */
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
  downloadAssignmentExport,
  ASSIGNMENT_STATUS_COLOR,
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
import { SessionDetailDrawer } from './SessionDetailDrawer'
import { NoteEditor, type BacklinkEntry } from './NoteEditor'
import { CorrectionMode } from './CorrectionMode'
import { Kpi } from './class-parts'
import { DocumentsPanel } from './DocumentsPanel'
import type { RubricCriterion } from '../../../services/education'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatNumber } from '../../../i18n/format'
import { formatShortDate } from './eduFormat'
import { ASSIGNMENT_KIND_KEYS, ASSIGNMENT_STATUS_KEYS, SUBMISSION_STATUS_KEYS } from './eduCLabels'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'
export type ClassTab = 'overview' | 'students' | 'sessions' | 'assignments' | 'notes'

const KANBAN_COLS: { status: EducationAssignmentStatus; labelKey: MessageKey }[] = [
  { status: 'DRAFT', labelKey: ASSIGNMENT_STATUS_KEYS.DRAFT },
  { status: 'OUVERT', labelKey: ASSIGNMENT_STATUS_KEYS.OUVERT },
  { status: 'EN_CORRECTION', labelKey: ASSIGNMENT_STATUS_KEYS.EN_CORRECTION },
  { status: 'CLOS', labelKey: ASSIGNMENT_STATUS_KEYS.CLOS },
]

/**
 * Kanban devoirs partagé (AssignmentsTab + AssignmentsView) avec drag-and-drop
 * HTML5 natif : déplacement optimiste, rollback si l'API échoue.
 */
function AssignmentKanban({
  items,
  onOpen,
  onMoved,
  showClassDot,
}: {
  items: EducationAssignment[]
  onOpen: (id: string) => void
  onMoved: () => void
  showClassDot?: boolean
}) {
  const { t } = useI18n()
  const [dragOver, setDragOver] = useState<EducationAssignmentStatus | null>(null)
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [items])

  async function drop(status: EducationAssignmentStatus, id: string) {
    const a = local.find((x) => x._id === id)
    if (!a || a.status === status) return
    // Optimiste : la carte change de colonne immédiatement.
    setLocal((prev) => prev.map((x) => (x._id === id ? { ...x, status } : x)))
    try {
      await updateAssignment(id, { status })
      onMoved()
    } catch {
      setLocal(items) // rollback
    }
  }

  return (
    <div className="edu-kanban">
      {KANBAN_COLS.map((col) => {
        const list = local.filter((i) => i.status === col.status)
        return (
          <div
            key={col.status}
            className={`edu-kanban-col${dragOver === col.status ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOver(col.status)
            }}
            onDragLeave={() => setDragOver((c) => (c === col.status ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = e.dataTransfer.getData('text/plain')
              if (id) drop(col.status, id)
            }}
          >
            <div className="edu-kanban-col-head">
              <span>{t(col.labelKey)}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{list.length}</span>
            </div>
            {list.length === 0 && <div className="edu-kanban-empty">—</div>}
            {list.map((a) => {
              const cls = showClassDot && typeof a.classId !== 'string' ? a.classId : null
              return (
                <div
                  key={a._id}
                  className="edu-kanban-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', a._id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onOpen(a._id)}
                >
                  <div className="edu-kanban-card-title">{a.title}</div>
                  <div className="edu-kanban-card-meta">
                    {cls && <span style={{ color: cls.color }}>● </span>}
                    {t(ASSIGNMENT_KIND_KEYS[a.kind])}
                    {a.deadline && ` · ${formatShortDate(a.deadline)}`}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function AssignmentsTab({
  classId,
  onChanged,
  templates,
}: {
  classId: string
  onChanged: () => void
  templates?: EducationTemplate[]
}) {
  const { t } = useI18n()
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const refresh = useCallback(async () => {
    const r = await listAssignments({ classId })
    setItems(r.assignments)
  }, [classId])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between" style={{ marginBottom: 12 }}>
        <strong>{t('eduC.shared.assignmentCount', { count: items.length })}</strong>
        <button className="edu-btn" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> {t('eduC.shared.newAssignment')}
        </button>
      </div>

      <AssignmentKanban
        items={items}
        onOpen={setOpenId}
        onMoved={async () => {
          await refresh()
          onChanged()
        }}
      />

      {showCreate && (
        <AssignmentForm
          classId={classId}
          templates={templates}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

export function AssignmentForm({
  classId,
  classes,
  templates,
  onClose,
  onSaved,
}: {
  /** Si absent, un select de classe obligatoire est affiché (utiliser `classes`). */
  classId?: string
  classes?: EducationClass[]
  /** Templates kind="assignment", filtrés par l'appelant. */
  templates?: EducationTemplate[]
  onClose: () => void
  /** Reçoit le devoir créé (utilisé par PostSessionFlow pour l'afficher). */
  onSaved: (created?: EducationAssignment) => void
}) {
  const { t } = useI18n()
  const [classChoice, setClassChoice] = useState(classId ?? '')
  const [templateId, setTemplateId] = useState('')
  const [form, setForm] = useState({
    title: '',
    kind: 'DEVOIR' as EducationAssignment['kind'],
    instructions: '',
    deadline: '',
    maxGrade: 20,
    weight: 1,
    status: 'OUVERT' as EducationAssignmentStatus,
    rubric: [] as RubricCriterion[],
    expectedDeliverables: [] as string[],
  })
  const [saving, setSaving] = useState(false)

  // Pré-remplit le form depuis template.body (champs reconnus, le reste ignoré).
  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates?.find((x) => x._id === id)
    if (!t) return
    const b = t.body as Record<string, unknown>
    const kinds = Object.keys(ASSIGNMENT_KIND_KEYS)
    setForm((f) => ({
      ...f,
      title: typeof b.title === 'string' ? b.title : f.title,
      kind: typeof b.kind === 'string' && kinds.includes(b.kind) ? (b.kind as EducationAssignment['kind']) : f.kind,
      instructions: typeof b.instructions === 'string' ? b.instructions : f.instructions,
      maxGrade: typeof b.maxGrade === 'number' ? b.maxGrade : f.maxGrade,
      weight: typeof b.weight === 'number' ? b.weight : f.weight,
      rubric: Array.isArray(b.rubric)
        ? (b.rubric as unknown[]).filter(
            (r): r is RubricCriterion =>
              !!r && typeof r === 'object' && typeof (r as RubricCriterion).label === 'string',
          )
        : f.rubric,
      expectedDeliverables: Array.isArray(b.expectedDeliverables)
        ? (b.expectedDeliverables as unknown[]).filter((d): d is string => typeof d === 'string')
        : f.expectedDeliverables,
    }))
  }

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer" style={{ width: 'min(560px, 92vw)' }}>
        <div className="edu-drawer-head">
          <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
            {t('eduC.shared.newAssignment')}
          </h2>
          <button className="edu-btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="edu-drawer-body">
          {templates && templates.length > 0 && (
            <div className="edu-form-group">
              <label>{t('eduC.assignment.fromTemplate')}</label>
              <select className="edu-select" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">{t('eduC.assignment.noTemplate')}</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!classId && (
            <div className="edu-form-group">
              <label>{t('eduC.assignment.classRequired')}</label>
              <select className="edu-select" value={classChoice} onChange={(e) => setClassChoice(e.target.value)}>
                <option value="">{t('eduC.assignment.chooseClass')}</option>
                {(classes ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="edu-form-group">
            <label>{t('eduC.assignment.fieldTitle')}</label>
            <input
              className="edu-input"
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduC.assignment.fieldType')}</label>
              <select
                className="edu-select"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as EducationAssignment['kind'] })}
              >
                {Object.entries(ASSIGNMENT_KIND_KEYS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </div>
            <div className="edu-form-group">
              <label>{t('eduC.shared.status')}</label>
              <select
                className="edu-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EducationAssignmentStatus })}
              >
                {Object.entries(ASSIGNMENT_STATUS_KEYS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="edu-grid-2">
            <div className="edu-form-group">
              <label>{t('eduC.shared.dueDate')}</label>
              <input
                type="datetime-local"
                className="edu-input"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div className="edu-form-group">
              <label>{t('eduC.assignment.fieldMaxGrade')}</label>
              <input
                type="number"
                className="edu-input"
                value={form.maxGrade}
                onChange={(e) => setForm({ ...form, maxGrade: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="edu-form-group">
            <label>{t('eduC.shared.instructions')}</label>
            <textarea
              className="edu-textarea"
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
          {form.rubric.length > 0 && (
            <p className="edu-sub" style={{ marginTop: 4 }}>
              {t('eduC.assignment.templateRubric', {
                items: form.rubric.map((r) => `${r.label} (${formatNumber(r.max)})`).join(' · '),
              })}
            </p>
          )}
          {form.expectedDeliverables.length > 0 && (
            <p className="edu-sub" style={{ marginTop: 4 }}>
              {t('eduC.assignment.expectedDeliverables', { items: form.expectedDeliverables.join(' · ') })}
            </p>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="edu-btn"
            disabled={!form.title.trim() || !classChoice || saving}
            onClick={async () => {
              setSaving(true)
              try {
                const r = await createAssignment({
                  classId: classChoice,
                  title: form.title,
                  kind: form.kind,
                  status: form.status,
                  instructions: form.instructions,
                  deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
                  maxGrade: form.maxGrade,
                  weight: form.weight,
                  rubric: form.rubric,
                  expectedDeliverables: form.expectedDeliverables,
                })
                onSaved(r.assignment)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? t('eduC.assignment.creating') : t('eduC.assignment.create')}
          </button>
        </div>
      </div>
    </>
  )
}

export function AssignmentDetailDrawer({
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
  const { t } = useI18n()
  const [data, setData] = useState<{
    assignment: EducationAssignment
    submissions: EducationSubmission[]
    stats: { total: number; rendu: number; corrige: number; nonRendu: number; retard: number; moyenne: number | null }
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
              {t(ASSIGNMENT_KIND_KEYS[assignment.kind])}
              {assignment.deadline &&
                ` · ${t('eduC.assignment.dueOn', { date: formatShortDate(assignment.deadline) })}`}
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6 }}>
            <select
              className="edu-select"
              style={{ width: 'auto' }}
              value={assignment.status}
              onChange={async (e) => {
                await updateAssignment(assignmentId, { status: e.target.value as EducationAssignmentStatus })
                await refresh()
                onChanged()
              }}
            >
              {Object.entries(ASSIGNMENT_STATUS_KEYS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
            {onStartCorrection && (
              <button
                className="edu-btn"
                onClick={() => onStartCorrection(assignmentId)}
                title={t('eduC.assignment.openCorrectionTitle')}
              >
                {t('eduC.assignment.correctionMode')}
              </button>
            )}
            <button
              className="edu-btn ghost"
              onClick={() =>
                void downloadAssignmentExport(assignmentId).catch(() => {
                  // Le parcours de téléchargement affiche déjà les erreurs API
                  // dans les surfaces qui le pilotent ; ici il ne doit pas fermer le tiroir.
                })
              }
              title={t('eduC.assignment.exportTitle')}
            >
              {t('eduC.shared.exportCsv')}
            </button>
            <button className="edu-btn-icon" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="edu-drawer-body">
          <div className="edu-kpi-grid">
            <Kpi label={t('eduC.assignment.kpiSubmitted')} value={`${stats.rendu} / ${stats.total}`} />
            <Kpi label={t('eduC.shared.late')} value={stats.retard} />
            <Kpi label={t('eduC.shared.graded')} value={stats.corrige} />
            <Kpi
              label={t('eduC.assignment.kpiAverage')}
              value={stats.moyenne != null ? formatNumber(stats.moyenne) : '—'}
              sub={`/ ${formatNumber(assignment.maxGrade)}`}
            />
          </div>

          {assignment.instructions && (
            <>
              <h2 className="edu-h2">{t('eduC.shared.instructions')}</h2>
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

          {/* Pièces jointes (documents uploadés) */}
          <h2 className="edu-h2">{t('eduC.assignment.attachments')}</h2>
          <DocumentsPanel parentType="assignment" parentId={assignmentId} />

          <h2 className="edu-h2">{t('eduC.assignment.followUp')}</h2>
          {submissions.length === 0 ? (
            <div className="edu-empty">
              {t('eduC.assignment.draftHintLead')}
              <strong>{t(ASSIGNMENT_STATUS_KEYS.OUVERT)}</strong>
              {t('eduC.assignment.draftHintTail')}
            </div>
          ) : (
            <table className="edu-table">
              <thead>
                <tr>
                  <th>{t('eduC.assignment.colStudent')}</th>
                  <th>{t('eduC.shared.status')}</th>
                  <th>{t('eduC.assignment.colGrade')}</th>
                  <th>{t('eduC.assignment.colFeedback')}</th>
                </tr>
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
                            await updateSubmission(assignmentId, studentId, {
                              status: e.target.value as EducationSubmission['status'],
                            })
                            await refresh()
                          }}
                        >
                          {Object.entries(SUBMISSION_STATUS_KEYS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {t(v)}
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
                          onChange={async (e) => {
                            const studentId = typeof s.studentId === 'string' ? s.studentId : s.studentId._id
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
                          placeholder={t('eduC.assignment.feedbackPlaceholder')}
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

export function AssignmentsView({
  classes,
  onChanged,
  incomingOpenId,
  onCloseIncomingOpen,
  onStartCorrection,
  templates,
}: {
  classes: EducationClass[]
  onChanged: () => void
  incomingOpenId?: string | null
  onCloseIncomingOpen?: () => void
  onStartCorrection?: (id: string) => void
  templates?: EducationTemplate[]
}) {
  const { t } = useI18n()
  const [filterClass, setFilterClass] = useState<string>('')
  const [items, setItems] = useState<EducationAssignment[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  useEffect(() => {
    if (incomingOpenId) {
      setOpenId(incomingOpenId)
      onCloseIncomingOpen?.()
    }
  }, [incomingOpenId, onCloseIncomingOpen])

  const refresh = useCallback(async () => {
    const r = await listAssignments(filterClass ? { classId: filterClass } : {})
    setItems(r.assignments)
  }, [filterClass])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div>
      <div className="edu-row between">
        <h1 className="edu-h1">{t('eduC.assignment.viewTitle')}</h1>
        <div className="edu-row" style={{ gap: 8 }}>
          <select
            className="edu-select"
            style={{ width: 220 }}
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
          >
            <option value="">{t('eduC.assignment.allClasses')}</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="edu-btn" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> {t('eduC.shared.newAssignment')}
          </button>
        </div>
      </div>
      <p className="edu-sub">{t('eduC.shared.assignmentCount', { count: items.length })}</p>
      {items.length === 0 ? (
        <div className="edu-empty">
          <div className="edu-empty-icon">📋</div>
          <div>{filterClass ? t('eduC.assignment.emptyForClass') : t('eduC.assignment.emptyAll')}</div>
          <div className="edu-empty-sub">{t('eduC.assignment.emptyHint')}</div>
        </div>
      ) : (
        <AssignmentKanban
          items={items}
          onOpen={setOpenId}
          onMoved={async () => {
            await refresh()
            onChanged()
          }}
          showClassDot
        />
      )}
      {showCreate && (
        <AssignmentForm
          classId={filterClass || undefined}
          classes={classes}
          templates={templates}
          onClose={() => setShowCreate(false)}
          onSaved={async () => {
            setShowCreate(false)
            await refresh()
            onChanged()
          }}
        />
      )}
      {openId && (
        <AssignmentDetailDrawer
          assignmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={async () => {
            await refresh()
            onChanged()
          }}
          onStartCorrection={onStartCorrection}
        />
      )}
    </div>
  )
}

/* ─── Search modal ─────────────────────────────────────────────────────── */
