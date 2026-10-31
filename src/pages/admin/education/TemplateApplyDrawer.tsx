import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import {
  createAssignment,
  createClass,
  createNote,
  createSession,
  type EducationClass,
  type EducationTemplate,
} from '../../../services/education'
import { TemplatePreview, templateBodyError } from './TemplateBodyEditor'

export function TemplateApplyDrawer({
  template,
  classes,
  onClose,
  onApplied,
}: {
  template: EducationTemplate
  classes: EducationClass[]
  onClose: () => void
  onApplied: () => void
}) {
  const { t } = useI18n()
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState(
    String(template.body[template.kind === 'class' ? 'name' : 'title'] || template.name),
  )
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function apply() {
    if (busy || !title.trim() || (template.kind !== 'class' && !classId)) return
    setBusy(true)
    setError(null)
    try {
      const body = template.body
      const invalid = templateBodyError(template.kind, body)
      if (invalid) throw new Error(invalid)
      const pick = (keys: string[]) =>
        Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]))
      if (template.kind === 'class')
        await createClass({
          ...pick(['school', 'level', 'program', 'weeklyHours', 'totalHours', 'color', 'emoji', 'notes', 'properties']),
          name: title.trim(),
        })
      else if (template.kind === 'session') {
        if (!date || !Number.isFinite(new Date(date).getTime())) throw new Error(translate('eduA.apply.dateRequired'))
        await createSession({
          ...pick(['theme', 'agenda', 'objectives', 'durationMin', 'location', 'supports']),
          title: title.trim(),
          classId,
          date: new Date(date).toISOString(),
          status: 'PLANIFIEE',
        })
      } else if (template.kind === 'assignment')
        await createAssignment({
          ...pick([
            'kind',
            'instructions',
            'maxGrade',
            'weight',
            'rubric',
            'expectedDeliverables',
            'feedbackSnippets',
            'groupMode',
          ]),
          title: title.trim(),
          classId,
          status: 'DRAFT',
        })
      else
        await createNote({
          ...pick(['blocks', 'markdown', 'emoji']),
          title: title.trim(),
          links: [{ type: 'class', refId: classId }],
        })
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('eduA.apply.failed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <WorkspaceOverlayPortal>
      <div
        className="edu-drawer-backdrop"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div className="edu-drawer" role="dialog" aria-label={t('eduA.apply.dialogAria')}>
        <div className="edu-drawer-head">
          <h2>{t('eduA.apply.title', { name: template.name })}</h2>
          <button className="edu-btn ghost" disabled={busy} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="edu-drawer-body">
          <p>
            {template.kind === 'class'
              ? t('eduA.apply.introClass')
              : template.kind === 'assignment'
                ? t('eduA.apply.introAssignment')
                : t('eduA.apply.introOther')}
          </p>
          <label className="edu-form-group">
            {template.kind === 'class' ? t('eduA.apply.newClassName') : t('eduA.templates.field.title')}
            <input className="edu-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {template.kind !== 'class' && (
            <label className="edu-form-group">
              {t('eduA.apply.targetClass')}
              <select className="edu-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">{t('eduA.apply.chooseClass')}</option>
                {classes
                  .filter((c) => !c.deletedAt && c.status !== 'ARCHIVE')
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                      {c.school ? ` · ${c.school}` : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {template.kind === 'session' && (
            <label className="edu-form-group">
              {t('eduA.apply.dateTime')}
              <input
                className="edu-input"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          <TemplatePreview
            kind={template.kind}
            body={{ ...template.body, [template.kind === 'class' ? 'name' : 'title']: title }}
          />
          {error && (
            <p className="edu-banner-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="edu-drawer-foot">
          <button
            className="edu-btn"
            disabled={
              busy || !title.trim() || (template.kind !== 'class' && !classId) || (template.kind === 'session' && !date)
            }
            onClick={() => {
              void apply()
            }}
          >
            {busy ? t('eduA.apply.creating') : t('eduA.apply.create')}
          </button>
        </div>
      </div>
    </WorkspaceOverlayPortal>
  )
}
