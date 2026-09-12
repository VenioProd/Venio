import { NoteEditor } from './NoteEditor'
import {
  ASSIGNMENT_KIND_LABEL,
  type EducationNote,
  type EducationTemplateKind,
  type NoteBlock,
  type RubricCriterion,
} from '../../../services/education'

type Body = Record<string, unknown>
const FIELD_LABELS: Record<string, string> = {
  title: 'Titre',
  name: 'Nom de la classe',
  theme: 'Thème',
  agenda: 'Déroulé',
  objectives: 'Objectifs',
  durationMin: 'Durée (minutes)',
  supports: 'Supports (liens)',
  instructions: 'Consignes',
  maxGrade: 'Note maximale',
  weight: 'Coefficient',
  expectedDeliverables: 'Livrables attendus',
  rubric: 'Barème',
  school: 'École',
  level: 'Niveau',
  program: 'Programme',
  weeklyHours: 'Heures par semaine',
  location: 'Lieu',
  blocks: 'Contenu de la note',
}
export function TemplateBodyEditor({
  kind,
  body,
  onChange,
}: {
  kind: EducationTemplateKind
  body: Body
  onChange: (body: Body) => void
}) {
  const patch = (key: string, value: unknown) => onChange({ ...body, [key]: value })
  const field = (key: string, mode: 'text' | 'long' | 'lines' | 'number' = 'text', min = 0) => {
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
        {FIELD_LABELS[key]}
        {mode === 'long' || mode === 'lines' ? (
          <textarea
            aria-label={FIELD_LABELS[key]}
            className="edu-textarea"
            value={value}
            onChange={(e) => patch(key, mode === 'lines' ? e.target.value.split('\n') : e.target.value)}
          />
        ) : (
          <input
            aria-label={FIELD_LABELS[key]}
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
        {mode === 'lines' && <small>Un élément par ligne.</small>}
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
            Type de devoir
            <select
              className="edu-select"
              value={String(body.kind || 'DEVOIR')}
              onChange={(e) => patch('kind', e.target.value)}
            >
              {Object.entries(ASSIGNMENT_KIND_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {field('instructions', 'long')}
          {field('maxGrade', 'number', 1)}
          {field('weight', 'number', 0.01)}
          {field('expectedDeliverables', 'lines')}
          <fieldset className="edu-template-rubric">
            <legend>Barème de correction</legend>
            {rubric.map((item, index) => (
              <div className="edu-row" key={index}>
                <label>
                  Critère {index + 1}
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
                  Points
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
                  aria-label={`Supprimer le critère ${index + 1}`}
                  onClick={() =>
                    patch(
                      'rubric',
                      rubric.filter((_, i) => i !== index),
                    )
                  }
                >
                  Retirer
                </button>
              </div>
            ))}
            <button className="edu-btn ghost" onClick={() => patch('rubric', [...rubric, { label: '', max: 0 }])}>
              Ajouter un critère
            </button>
            {rubric.length > 0 && (
              <p>
                Total du barème : {rubric.reduce((sum, r) => sum + r.max, 0)} / {Number(body.maxGrade ?? 20)}
              </p>
            )}
          </fieldset>
        </>
      )}
    </div>
  )
}

export function templateBodyError(kind: EducationTemplateKind, body: Body): string | null {
  const strings = ['title', 'name', 'theme', 'agenda', 'location', 'instructions', 'school', 'level', 'program']
  for (const key of strings)
    if (body[key] !== undefined && typeof body[key] !== 'string') return `${FIELD_LABELS[key]} doit être du texte.`
  for (const key of ['objectives', 'supports', 'expectedDeliverables'])
    if (
      body[key] !== undefined &&
      (!Array.isArray(body[key]) || !(body[key] as unknown[]).every((v) => typeof v === 'string'))
    )
      return `${FIELD_LABELS[key]} doit être une liste de textes.`
  for (const key of kind === 'session'
    ? ['durationMin']
    : kind === 'assignment'
      ? ['maxGrade', 'weight']
      : kind === 'class'
        ? ['weeklyHours']
        : []) {
    const value = body[key]
    if (
      value !== undefined &&
      !(key === 'weeklyHours' && value === null) &&
      (typeof value !== 'number' || !Number.isFinite(value) || (key === 'weeklyHours' ? value < 0 : value <= 0))
    )
      return `${FIELD_LABELS[key]} doit être un nombre ${key === 'weeklyHours' ? 'positif ou nul' : 'supérieur à zéro'}.`
  }
  if (kind === 'assignment') {
    if (body.kind !== undefined && !Object.prototype.hasOwnProperty.call(ASSIGNMENT_KIND_LABEL, String(body.kind)))
      return 'Type de devoir invalide.'
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
      return 'Chaque critère du barème nécessite un libellé et des points positifs ou nuls.'
    const total = (Array.isArray(body.rubric) ? (body.rubric as RubricCriterion[]) : []).reduce(
      (sum, r) => sum + r.max,
      0,
    )
    if (total > Number(body.maxGrade ?? 20)) return 'Le total du barème dépasse la note maximale.'
  }
  if (
    kind === 'note' &&
    body.blocks !== undefined &&
    (!Array.isArray(body.blocks) ||
      !body.blocks.every(
        (b) => b && typeof b.id === 'string' && typeof b.type === 'string' && typeof b.text === 'string',
      ))
  )
    return 'Le contenu de la note est invalide.'
  return null
}

export function TemplatePreview({ kind, body }: { kind: EducationTemplateKind; body: Body }) {
  const keys =
    kind === 'session'
      ? ['title', 'theme', 'durationMin', 'location', 'objectives', 'agenda', 'supports']
      : kind === 'assignment'
        ? ['title', 'instructions', 'maxGrade', 'weight', 'expectedDeliverables', 'rubric']
        : kind === 'class'
          ? ['name', 'school', 'level', 'program', 'weeklyHours']
          : ['blocks']
  return (
    <section className="edu-template-preview" aria-label="Aperçu du template">
      <h3>Aperçu</h3>
      {keys.map((key) => {
        const value = body[key]
        if (value === undefined || value === '' || value === null) return null
        return (
          <div key={key}>
            <strong>{FIELD_LABELS[key]}</strong>
            {Array.isArray(value) ? (
              <ul>
                {value.map((item, i) => (
                  <li key={i}>
                    {typeof item === 'string'
                      ? item
                      : item && typeof item === 'object'
                        ? key === 'rubric'
                          ? `${item.label} · ${item.max} points`
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
