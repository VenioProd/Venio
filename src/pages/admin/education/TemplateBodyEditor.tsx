import { NoteEditor } from './NoteEditor'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import {
  ASSIGNMENT_KIND_LABEL,
  type EducationAssignmentKind,
  type EducationNote,
  type EducationTemplateKind,
  type NoteBlock,
  type RubricCriterion,
} from '../../../services/education'

type Body = Record<string, unknown>
const FIELD_LABEL_KEYS = {
  title: 'eduA.templates.field.title',
  name: 'eduA.templates.field.name',
  theme: 'eduA.templates.field.theme',
  agenda: 'eduA.templates.field.agenda',
  objectives: 'eduA.templates.field.objectives',
  durationMin: 'eduA.templates.field.durationMin',
  supports: 'eduA.templates.field.supports',
  instructions: 'eduA.templates.field.instructions',
  maxGrade: 'eduA.templates.field.maxGrade',
  weight: 'eduA.templates.field.weight',
  expectedDeliverables: 'eduA.templates.field.expectedDeliverables',
  rubric: 'eduA.templates.field.rubric',
  school: 'eduA.templates.field.school',
  level: 'eduA.templates.field.level',
  program: 'eduA.templates.field.program',
  weeklyHours: 'eduA.templates.field.weeklyHours',
  location: 'eduA.templates.field.location',
  blocks: 'eduA.templates.field.blocks',
} as const satisfies Record<string, MessageKey>

type FieldKey = keyof typeof FIELD_LABEL_KEYS

const ASSIGNMENT_KIND_KEYS = {
  DEVOIR: 'eduA.templates.assignmentKind.devoir',
  PROJET: 'eduA.templates.assignmentKind.projet',
  EXPOSE: 'eduA.templates.assignmentKind.expose',
  QCM: 'eduA.templates.assignmentKind.qcm',
  EXAMEN: 'eduA.templates.assignmentKind.examen',
  AUTRE: 'eduA.templates.assignmentKind.autre',
} as const satisfies Record<EducationAssignmentKind, MessageKey>

export function TemplateBodyEditor({
  kind,
  body,
  onChange,
}: {
  kind: EducationTemplateKind
  body: Body
  onChange: (body: Body) => void
}) {
  const { t } = useI18n()
  const patch = (key: string, value: unknown) => onChange({ ...body, [key]: value })
  const field = (key: FieldKey, mode: 'text' | 'long' | 'lines' | 'number' = 'text', min = 0) => {
    const raw = body[key]
    const value =
      mode === 'lines'
        ? Array.isArray(raw)
          ? raw.join('\n')
          : ''
        : typeof raw === 'string' || typeof raw === 'number'
          ? raw
          : ''
    return (
      <label className="edu-form-group" key={key}>
        {t(FIELD_LABEL_KEYS[key])}
        {mode === 'long' || mode === 'lines' ? (
          <textarea
            aria-label={t(FIELD_LABEL_KEYS[key])}
            className="edu-textarea"
            value={value}
            onChange={(e) => patch(key, mode === 'lines' ? e.target.value.split('\n') : e.target.value)}
          />
        ) : (
          <input
            aria-label={t(FIELD_LABEL_KEYS[key])}
            className="edu-input"
            type={mode === 'number' ? 'number' : 'text'}
            min={min}
            step="any"
            value={value}
            onChange={(e) =>
              patch(key, mode === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)
            }
          />
        )}
        {mode === 'lines' && <small>{t('eduA.templates.onePerLine')}</small>}
      </label>
    )
  }
  if (kind === 'note') {
    const note: EducationNote = {
      _id: 'template-preview',
      title: '',
      emoji: '',
      cover: '',
      blocks: (Array.isArray(body.blocks) ? body.blocks : []) as NoteBlock[],
      markdown: '',
      links: [],
      tags: [],
      parentNote: null,
      pinned: false,
      archived: false,
      createdAt: '',
      updatedAt: '',
    }
    return (
      <NoteEditor
        note={note}
        hideHeader
        onDelete={() => {}}
        onChange={(next) => onChange({ ...body, blocks: next.blocks, markdown: next.markdown })}
      />
    )
  }
  const rubric = Array.isArray(body.rubric) ? (body.rubric as RubricCriterion[]) : []
  return (
    <div className="edu-template-fields">
      {kind === 'session' && (
        <>
          {field('title')}
          {field('theme')}
          {field('durationMin', 'number', 1)}
          {field('location')}
          {field('objectives', 'lines')}
          {field('agenda', 'long')}
          {field('supports', 'lines')}
        </>
      )}
      {kind === 'class' && (
        <>
          {field('name')}
          {field('school')}
          {field('level')}
          {field('program')}
          {field('weeklyHours', 'number')}
        </>
      )}
      {kind === 'assignment' && (
        <>
          {field('title')}
          <label className="edu-form-group">
            {t('eduA.templates.assignmentType')}
            <select
              className="edu-select"
              value={String(body.kind || 'DEVOIR')}
              onChange={(e) => patch('kind', e.target.value)}
            >
              {(Object.keys(ASSIGNMENT_KIND_KEYS) as EducationAssignmentKind[]).map((key) => (
                <option key={key} value={key}>
                  {t(ASSIGNMENT_KIND_KEYS[key])}
                </option>
              ))}
            </select>
          </label>
          {field('instructions', 'long')}
          {field('maxGrade', 'number', 1)}
          {field('weight', 'number', 0.01)}
          {field('expectedDeliverables', 'lines')}
          <fieldset className="edu-template-rubric">
            <legend>{t('eduA.templates.rubricLegend')}</legend>
            {rubric.map((item, index) => (
              <div className="edu-row" key={index}>
                <label>
                  {t('eduA.templates.criterion', { n: index + 1 })}
                  <input
                    className="edu-input"
                    value={item.label}
                    onChange={(e) =>
                      patch(
                        'rubric',
                        rubric.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)),
                      )
                    }
                  />
                </label>
                <label>
                  {t('eduA.templates.points')}
                  <input
                    className="edu-input"
                    type="number"
                    min="0"
                    step="any"
                    value={item.max}
                    onChange={(e) =>
                      patch(
                        'rubric',
                        rubric.map((r, i) => (i === index ? { ...r, max: Number(e.target.value) } : r)),
                      )
                    }
                  />
                </label>
                <button
                  className="edu-btn ghost"
                  aria-label={t('eduA.templates.removeCriterion', { n: index + 1 })}
                  onClick={() =>
                    patch(
                      'rubric',
                      rubric.filter((_, i) => i !== index),
                    )
                  }
                >
                  {t('eduA.templates.remove')}
                </button>
              </div>
            ))}
            <button className="edu-btn ghost" onClick={() => patch('rubric', [...rubric, { label: '', max: 0 }])}>
              {t('eduA.templates.addCriterion')}
            </button>
            {rubric.length > 0 && (
              <p>
                {t('eduA.templates.rubricTotal', {
                  total: rubric.reduce((sum, r) => sum + r.max, 0),
                  max: Number(body.maxGrade ?? 20),
                })}
              </p>
            )}
          </fieldset>
        </>
      )}
    </div>
  )
}

export function templateBodyError(kind: EducationTemplateKind, body: Body): string | null {
  const strings = [
    'title',
    'name',
    'theme',
    'agenda',
    'location',
    'instructions',
    'school',
    'level',
    'program',
  ] as const
  for (const key of strings)
    if (body[key] !== undefined && typeof body[key] !== 'string')
      return translate('eduA.templates.error.notText', { field: translate(FIELD_LABEL_KEYS[key]) })
  for (const key of ['objectives', 'supports', 'expectedDeliverables'] as const)
    if (
      body[key] !== undefined &&
      (!Array.isArray(body[key]) || !(body[key] as unknown[]).every((v) => typeof v === 'string'))
    )
      return translate('eduA.templates.error.notList', { field: translate(FIELD_LABEL_KEYS[key]) })
  const numberKeys: FieldKey[] =
    kind === 'session'
      ? ['durationMin']
      : kind === 'assignment'
        ? ['maxGrade', 'weight']
        : kind === 'class'
          ? ['weeklyHours']
          : []
  for (const key of numberKeys) {
    const value = body[key]
    if (
      value !== undefined &&
      !(key === 'weeklyHours' && value === null) &&
      (typeof value !== 'number' || !Number.isFinite(value) || (key === 'weeklyHours' ? value < 0 : value <= 0))
    )
      return translate(
        key === 'weeklyHours' ? 'eduA.templates.error.notNonNegative' : 'eduA.templates.error.notPositive',
        { field: translate(FIELD_LABEL_KEYS[key]) },
      )
  }
  if (kind === 'assignment') {
    if (body.kind !== undefined && !Object.prototype.hasOwnProperty.call(ASSIGNMENT_KIND_LABEL, String(body.kind)))
      return translate('eduA.templates.error.invalidKind')
    if (
      body.rubric !== undefined &&
      (!Array.isArray(body.rubric) ||
        !body.rubric.every(
          (r) =>
            r &&
            typeof r.label === 'string' &&
            r.label.trim() &&
            typeof r.max === 'number' &&
            Number.isFinite(r.max) &&
            r.max >= 0,
        ))
    )
      return translate('eduA.templates.error.invalidRubric')
    const total = (Array.isArray(body.rubric) ? (body.rubric as RubricCriterion[]) : []).reduce(
      (sum, r) => sum + r.max,
      0,
    )
    if (total > Number(body.maxGrade ?? 20)) return translate('eduA.templates.error.rubricTotal')
  }
  if (
    kind === 'note' &&
    body.blocks !== undefined &&
    (!Array.isArray(body.blocks) ||
      !body.blocks.every(
        (b) => b && typeof b.id === 'string' && typeof b.type === 'string' && typeof b.text === 'string',
      ))
  )
    return translate('eduA.templates.error.invalidNote')
  return null
}

export function TemplatePreview({ kind, body }: { kind: EducationTemplateKind; body: Body }) {
  const { t } = useI18n()
  const keys: FieldKey[] =
    kind === 'session'
      ? ['title', 'theme', 'durationMin', 'location', 'objectives', 'agenda', 'supports']
      : kind === 'assignment'
        ? ['title', 'instructions', 'maxGrade', 'weight', 'expectedDeliverables', 'rubric']
        : kind === 'class'
          ? ['name', 'school', 'level', 'program', 'weeklyHours']
          : ['blocks']
  return (
    <section className="edu-template-preview" aria-label={t('eduA.templates.previewAria')}>
      <h3>{t('eduA.templates.preview')}</h3>
      {keys.map((key) => {
        const value = body[key]
        if (value === undefined || value === '' || value === null) return null
        return (
          <div key={key}>
            <strong>{t(FIELD_LABEL_KEYS[key])}</strong>
            {Array.isArray(value) ? (
              <ul>
                {value.map((item, i) => (
                  <li key={i}>
                    {typeof item === 'string'
                      ? item
                      : item && typeof item === 'object'
                        ? key === 'rubric'
                          ? t('eduA.templates.rubricItem', { label: item.label, max: item.max })
                          : item.text
                        : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</p>
            )}
          </div>
        )
      })}
    </section>
  )
}
