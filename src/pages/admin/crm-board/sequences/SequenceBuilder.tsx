import { useRef, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import Dialog from '../automations/Dialog'
import { CRM_ENTITIES, CRM_STATUSES } from '../constants'
import { createSequence, updateSequence } from './api'
import {
  MAX_STEPS,
  SEND_HOURS,
  STEP_TYPES,
  TEMPLATE_VARIABLES,
  draftFromSequence,
  emptyDraft,
  emptyStep,
  payloadFromDraft,
  renderTemplate,
  stepKeyFor,
  validateDraft,
  type Sequence,
  type SequenceDraft,
  type StepField,
  type StepType,
} from './types'

interface Props {
  sequence: Sequence | null
  onClose: () => void
  onSaved: (text: string) => void
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export default function SequenceBuilder({ sequence, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [draft, setDraft] = useState<SequenceDraft>(() => (sequence ? draftFromSequence(sequence) : emptyDraft()))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const focused = useRef<{ uid: string; field: StepField } | null>(null)

  const sample = {
    contact: t('crmSeq.sample.contact'),
    company: t('crmSeq.sample.company'),
    owner: user?.name || t('crmSeq.var.owner'),
    amount: t('crmSeq.sample.amount'),
  }

  const patchStep = (uid: string, patch: Partial<SequenceDraft['steps'][number]>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) }))
  const move = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const target = index + dir
      if (target < 0 || target >= d.steps.length) return d
      const steps = [...d.steps]
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...d, steps }
    })

  const fieldId = (uid: string, field: StepField) => `crm-seq-${field}-${uid}`

  const insertVariable = (token: string) => {
    const target =
      focused.current && draft.steps.some((s) => s.uid === focused.current!.uid)
        ? focused.current
        : (() => {
            const first = draft.steps.find((s) => s.type === 'EMAIL') ?? draft.steps.find((s) => s.type === 'TASK')
            return first
              ? { uid: first.uid, field: (first.type === 'EMAIL' ? 'body' : 'taskTitle') as StepField }
              : null
          })()
    if (!target) return
    const step = draft.steps.find((s) => s.uid === target.uid)!
    const el = document.getElementById(fieldId(target.uid, target.field)) as
      HTMLInputElement | HTMLTextAreaElement | null
    const current = step[target.field]
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    patchStep(target.uid, { [target.field]: next })
    const caret = start + token.length
    requestAnimationFrame(() => {
      const node = document.getElementById(fieldId(target.uid, target.field)) as
        HTMLInputElement | HTMLTextAreaElement | null
      node?.focus()
      node?.setSelectionRange?.(caret, caret)
    })
  }

  const toggleStatus = (status: string) =>
    setDraft((d) => ({
      ...d,
      stopOn: {
        ...d.stopOn,
        statuses: d.stopOn.statuses.includes(status)
          ? d.stopOn.statuses.filter((s) => s !== status)
          : [...d.stopOn.statuses, status],
      },
    }))

  const save = async () => {
    const invalid = validateDraft(draft)
    if (invalid) {
      setProblem(t(invalid.key, invalid.params))
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      const payload = payloadFromDraft(draft)
      if (sequence) await updateSequence(sequence._id, payload)
      else await createSequence(payload)
      onSaved(t('crmSeq.msg.saved'))
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.builder.saveError')))
      setSaving(false)
    }
  }

  const track = (uid: string, field: StepField) => ({
    onFocus: () => {
      focused.current = { uid, field }
    },
  })

  return (
    <Dialog titleId="crm-seq-builder-t" className="crm-auto-dlg crm-seq-builder" onClose={onClose}>
      <h3 id="crm-seq-builder-t">{sequence ? t('crmSeq.builder.titleEdit') : t('crmSeq.builder.titleNew')}</h3>

      <div className="crm-auto-fld">
        <label htmlFor="crm-seq-name">{t('crmSeq.builder.name')}</label>
        <input
          id="crm-seq-name"
          className="crm-auto-inp"
          value={draft.name}
          maxLength={120}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="crm-auto-fld">
        <label htmlFor="crm-seq-desc">{t('crmSeq.builder.description')}</label>
        <textarea
          id="crm-seq-desc"
          className="crm-auto-txt"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <div className="crm-auto-fld">
        <label htmlFor="crm-seq-entity">{t('crmSeq.builder.entity')}</label>
        <select
          id="crm-seq-entity"
          className="crm-auto-sel"
          value={draft.entity}
          onChange={(e) => setDraft({ ...draft, entity: e.target.value })}
        >
          <option value="">{t('crmSeq.builder.entityNone')}</option>
          {CRM_ENTITIES.map((entity) => (
            <option key={entity.key} value={entity.key}>
              {t(entity.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <section className="crm-seq-vars" aria-label={t('crmSeq.builder.variables')}>
        <span className="crm-auto-lb">{t('crmSeq.builder.variables')}</span>
        <div className="crm-seq-var-list">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              className="crm-auto-chip"
              title={t(`crmSeq.var.${v.key}` as const)}
              aria-label={t('crmSeq.builder.insert', { name: v.token })}
              onClick={() => insertVariable(v.token)}
            >
              <code>{v.token}</code>
            </button>
          ))}
        </div>
        <small className="crm-auto-note">{t('crmSeq.builder.variablesHint')}</small>
      </section>

      <section className="crm-seq-steps" aria-label={t('crmSeq.builder.steps')}>
        <span className="crm-auto-lb">{t('crmSeq.builder.steps')}</span>
        {draft.steps.length === 0 && <p className="crm-auto-note">{t('crmSeq.builder.noSteps')}</p>}
        <ol>
          {draft.steps.map((step, i) => {
            const n = i + 1
            return (
              <li key={step.uid} className="crm-seq-step crm-auto-glass" data-testid={`step-${i}`}>
                <div className="crm-seq-step-h">
                  <b>{t('crmSeq.builder.stepN', { n })}</b>
                  <span className="crm-auto-sp" />
                  <button
                    type="button"
                    className="crm-auto-ibtn"
                    disabled={i === 0}
                    aria-label={t('crmSeq.builder.up', { n })}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="crm-auto-ibtn"
                    disabled={i === draft.steps.length - 1}
                    aria-label={t('crmSeq.builder.down', { n })}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="crm-auto-ibtn"
                    aria-label={t('crmSeq.builder.remove', { n })}
                    onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.uid !== step.uid) }))}
                  >
                    ×
                  </button>
                </div>
                <div className="crm-seq-grid">
                  <div className="crm-auto-fld">
                    <label htmlFor={`crm-seq-type-${step.uid}`}>{t('crmSeq.builder.type', { n })}</label>
                    <select
                      id={`crm-seq-type-${step.uid}`}
                      className="crm-auto-sel"
                      value={step.type}
                      onChange={(e) => patchStep(step.uid, { type: e.target.value as StepType })}
                    >
                      {STEP_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(stepKeyFor(type))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="crm-auto-fld">
                    <label htmlFor={`crm-seq-delay-${step.uid}`}>{t('crmSeq.builder.delay', { n })}</label>
                    <input
                      id={`crm-seq-delay-${step.uid}`}
                      className="crm-auto-inp"
                      type="number"
                      min={0}
                      max={365}
                      value={step.delayDays}
                      onChange={(e) => patchStep(step.uid, { delayDays: Number(e.target.value) })}
                    />
                  </div>
                  {step.type !== 'WAIT' && (
                    <div className="crm-auto-fld">
                      <label htmlFor={`crm-seq-hour-${step.uid}`}>{t('crmSeq.builder.hour', { n })}</label>
                      <select
                        id={`crm-seq-hour-${step.uid}`}
                        className="crm-auto-sel"
                        value={step.sendHourParis}
                        onChange={(e) => patchStep(step.uid, { sendHourParis: Number(e.target.value) })}
                      >
                        {SEND_HOURS.map((h) => (
                          <option key={h} value={h}>
                            {h} h
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {i === 0 && <small className="crm-auto-note">{t('crmSeq.builder.delayHint')}</small>}
                {step.type === 'EMAIL' && (
                  <>
                    <div className="crm-auto-fld">
                      <label htmlFor={fieldId(step.uid, 'subject')}>{t('crmSeq.builder.subject', { n })}</label>
                      <input
                        id={fieldId(step.uid, 'subject')}
                        className="crm-auto-inp"
                        value={step.subject}
                        {...track(step.uid, 'subject')}
                        onChange={(e) => patchStep(step.uid, { subject: e.target.value })}
                      />
                    </div>
                    <div className="crm-auto-fld">
                      <label htmlFor={fieldId(step.uid, 'body')}>{t('crmSeq.builder.body', { n })}</label>
                      <textarea
                        id={fieldId(step.uid, 'body')}
                        className="crm-auto-txt"
                        value={step.body}
                        {...track(step.uid, 'body')}
                        onChange={(e) => patchStep(step.uid, { body: e.target.value })}
                      />
                    </div>
                    <div
                      className="crm-seq-preview"
                      aria-label={t('crmSeq.builder.preview')}
                      data-testid={`preview-${i}`}
                    >
                      <span className="crm-auto-lb">{t('crmSeq.builder.preview')}</span>
                      <strong>{renderTemplate(step.subject, sample) || t('crmSeq.builder.previewEmpty')}</strong>
                      <p>{renderTemplate(step.body, sample) || t('crmSeq.builder.previewEmpty')}</p>
                      <small className="crm-auto-note">{t('crmSeq.builder.previewNote')}</small>
                    </div>
                  </>
                )}
                {step.type === 'TASK' && (
                  <>
                    <div className="crm-auto-fld">
                      <label htmlFor={fieldId(step.uid, 'taskTitle')}>{t('crmSeq.builder.taskTitle', { n })}</label>
                      <input
                        id={fieldId(step.uid, 'taskTitle')}
                        className="crm-auto-inp"
                        value={step.taskTitle}
                        {...track(step.uid, 'taskTitle')}
                        onChange={(e) => patchStep(step.uid, { taskTitle: e.target.value })}
                      />
                    </div>
                    <div className="crm-auto-fld">
                      <label htmlFor={fieldId(step.uid, 'body')}>{t('crmSeq.builder.taskBody', { n })}</label>
                      <textarea
                        id={fieldId(step.uid, 'body')}
                        className="crm-auto-txt"
                        value={step.body}
                        {...track(step.uid, 'body')}
                        onChange={(e) => patchStep(step.uid, { body: e.target.value })}
                      />
                    </div>
                    <div
                      className="crm-seq-preview"
                      aria-label={t('crmSeq.builder.preview')}
                      data-testid={`preview-${i}`}
                    >
                      <span className="crm-auto-lb">{t('crmSeq.builder.preview')}</span>
                      <strong>{renderTemplate(step.taskTitle, sample) || t('crmSeq.builder.previewEmpty')}</strong>
                      {step.body && <p>{renderTemplate(step.body, sample)}</p>}
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
          disabled={draft.steps.length >= MAX_STEPS}
          onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep('EMAIL')] }))}
        >
          {t('crmSeq.builder.addStep')}
        </button>
      </section>

      <fieldset className="crm-auto-fld crm-seq-stop">
        <legend>{t('crmSeq.builder.stop')}</legend>
        <label className="crm-seq-check">
          <input
            type="checkbox"
            checked={draft.stopOn.reply}
            onChange={(e) => setDraft({ ...draft, stopOn: { ...draft.stopOn, reply: e.target.checked } })}
          />
          {t('crmSeq.builder.stopReply')}
        </label>
        <label className="crm-seq-check">
          <input
            type="checkbox"
            checked={draft.stopOn.statusChange}
            onChange={(e) => setDraft({ ...draft, stopOn: { ...draft.stopOn, statusChange: e.target.checked } })}
          />
          {t('crmSeq.builder.stopStatus')}
        </label>
        {draft.stopOn.statusChange && (
          <div className="crm-seq-statuses">
            {CRM_STATUSES.map((s) => (
              <label key={s.key} className="crm-seq-check">
                <input
                  type="checkbox"
                  checked={draft.stopOn.statuses.includes(s.key)}
                  onChange={() => toggleStatus(s.key)}
                />
                {t(s.labelKey)}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <p className="crm-auto-note">{t('crmSeq.builder.unsubscribe')}</p>
      {problem && (
        <p className="crm-auto-err" role="alert">
          {problem}
        </p>
      )}
      <div className="crm-auto-row">
        <button
          type="button"
          className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="portal-button crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? t('crmSeq.builder.saving') : t('crmSeq.builder.save')}
        </button>
      </div>
    </Dialog>
  )
}
