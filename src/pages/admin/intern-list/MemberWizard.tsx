import { useMemo, useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { apiFetch } from '../../../lib/api'
import { INTERN_DAYS, INTERN_DAY_LABEL_KEYS, type AdminUser } from './types'
import {
  creatableGroups,
  isInternKind,
  isValidEmail,
  monthsBetween,
  type MemberKind,
  type MemberKindOption,
} from './memberKinds'
import './MemberWizard.css'

interface Props {
  admins: AdminUser[]
  actorRole: string | undefined
  onClose: () => void
  onCreated: () => void
}

interface Draft {
  name: string
  email: string
  phone: string
  jobTitle: string
  poste: string
  departement: string
  tuteur: string
  dateDebut: string
  dateFin: string
  ecole: string
  formation: string
  notes: string
  joursPresence: string[]
  sendInvitation: boolean
}

type StepId = 'kind' | 'identity' | 'mission' | 'access'
const STEP_LABELS: Record<StepId, MessageKey> = {
  kind: 'intern.member.step.kind',
  identity: 'intern.member.step.identity',
  mission: 'intern.member.step.mission',
  access: 'intern.member.step.access',
}

const WORK_WEEK = INTERN_DAYS.slice(0, 5)
const PRESETS: {
  key: 'intern.member.days.workWeek' | 'intern.member.days.halfTime' | 'intern.member.days.alternance'
  days: string[]
}[] = [
  { key: 'intern.member.days.workWeek', days: WORK_WEEK },
  { key: 'intern.member.days.halfTime', days: ['lundi', 'mardi', 'mercredi'] },
  { key: 'intern.member.days.alternance', days: ['jeudi', 'vendredi'] },
]

const EMPTY: Draft = {
  name: '',
  email: '',
  phone: '',
  jobTitle: '',
  poste: '',
  departement: '',
  tuteur: '',
  dateDebut: '',
  dateFin: '',
  ecole: '',
  formation: '',
  notes: '',
  joursPresence: WORK_WEEK,
  sendInvitation: true,
}

interface CreateResponse {
  credentialsSent: boolean
}

export default function MemberWizard({ admins, actorRole, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const [kind, setKind] = useState<MemberKind | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [stepIndex, setStepIndex] = useState(0)
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<CreateResponse | null>(null)

  const groups = useMemo(() => creatableGroups(actorRole), [actorRole])
  const intern = isInternKind(kind)
  const steps: StepId[] = intern ? ['kind', 'identity', 'mission', 'access'] : ['kind', 'identity', 'access']
  const step = steps[stepIndex]
  const selected: MemberKindOption | undefined = groups.flatMap((g) => g.kinds).find((o) => o.kind === kind)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const months = monthsBetween(draft.dateDebut, draft.dateFin)

  const errors = useMemo(() => {
    const found: Partial<Record<keyof Draft | 'dates', MessageKey>> = {}
    if (!draft.name.trim()) found.name = 'intern.member.error.name'
    if (!isValidEmail(draft.email)) found.email = 'intern.member.error.email'
    if (intern) {
      if (!draft.poste.trim()) found.poste = 'intern.member.error.role'
      if (!draft.dateDebut || !draft.dateFin) found.dates = 'intern.member.error.datesRequired'
      else if (months === null) found.dates = 'intern.member.error.datesOrder'
    }
    return found
  }, [draft, intern, months])

  const stepHasError = (id: StepId): boolean => {
    if (id === 'kind') return kind === null
    if (id === 'identity') return Boolean(errors.name || errors.email)
    if (id === 'mission') return Boolean(errors.poste || errors.dates)
    return false
  }

  const next = () => {
    setTouched(true)
    if (stepHasError(step)) return
    setTouched(false)
    setStepIndex((index) => Math.min(index + 1, steps.length - 1))
  }

  const back = () => {
    setTouched(false)
    setStepIndex((index) => Math.max(index - 1, 0))
  }

  const togglePickKind = (value: MemberKind) => {
    setKind(value)
    setStepIndex(0)
  }

  const toggleDay = (day: string) =>
    set(
      'joursPresence',
      draft.joursPresence.includes(day) ? draft.joursPresence.filter((d) => d !== day) : [...draft.joursPresence, day],
    )

  const submit = async () => {
    if (!kind) return
    setSubmitting(true)
    setError('')
    try {
      const result = await apiFetch<CreateResponse>('/api/admin/members', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          jobTitle: draft.jobTitle.trim(),
          sendInvitation: draft.sendInvitation,
          ...(intern
            ? {
                intern: {
                  poste: draft.poste.trim(),
                  departement: draft.departement.trim(),
                  tuteur: draft.tuteur || undefined,
                  dateDebut: draft.dateDebut,
                  dateFin: draft.dateFin,
                  ecole: draft.ecole.trim(),
                  formation: draft.formation.trim(),
                  notes: draft.notes.trim(),
                  joursPresence: draft.joursPresence,
                },
              }
            : {}),
        }),
      })
      setDone(result)
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('intern.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldError = (key: keyof typeof errors) =>
    touched && errors[key] ? (
      <span className="mw-error" role="alert">
        {t(errors[key]!)}
      </span>
    ) : null

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="mw"
        role="dialog"
        aria-modal="true"
        aria-label={t('intern.member.wizard.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mw-head">
          <h2>{t('intern.member.wizard.title')}</h2>
          <button type="button" className="mw-close" onClick={onClose} aria-label={t('intern.member.wizard.close')}>
            ×
          </button>
        </header>

        {done ? (
          <div className="mw-body mw-done">
            <p className="mw-done-title">{t('intern.member.done.title', { name: draft.name })}</p>
            <p>
              {!draft.sendInvitation
                ? t('intern.member.done.noInvite')
                : done.credentialsSent
                  ? t('intern.member.done.invited', { email: draft.email })
                  : t('intern.member.done.inviteFailed')}
            </p>
            <button type="button" className="ticket-new-btn" onClick={onClose}>
              {t('intern.member.wizard.close')}
            </button>
          </div>
        ) : (
          <>
            <ol className="mw-steps" aria-label={t('intern.member.wizard.steps')}>
              {steps.map((id, index) => (
                <li key={id} className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-done' : ''}>
                  <span>{index + 1}</span> {t(STEP_LABELS[id])}
                </li>
              ))}
            </ol>

            <div className="mw-body">
              {step === 'kind' && (
                <>
                  {groups.map((group) => (
                    <section key={group.key}>
                      <h3 className="mw-group">{t(group.label)}</h3>
                      <div className="mw-cards">
                        {group.kinds.map((option) => (
                          <button
                            key={option.kind}
                            type="button"
                            className={`mw-card ${kind === option.kind ? 'is-selected' : ''}`}
                            aria-pressed={kind === option.kind}
                            onClick={() => togglePickKind(option.kind)}
                          >
                            <strong>{t(option.label)}</strong>
                            <span>{t(option.hint)}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                  {touched && kind === null && <span className="mw-error">{t('intern.member.error.kind')}</span>}
                </>
              )}

              {step === 'identity' && (
                <div className="mw-grid">
                  <label>
                    {t('intern.form.fullName')}
                    <input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
                    {fieldError('name')}
                  </label>
                  <label>
                    {t('intern.form.email')}
                    <input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
                    {fieldError('email')}
                  </label>
                  <label>
                    {t('intern.form.phone')}
                    <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
                  </label>
                  {!intern && (
                    <label>
                      {t('intern.member.field.jobTitle')}
                      <input value={draft.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} />
                    </label>
                  )}
                </div>
              )}

              {step === 'mission' && (
                <div className="mw-grid">
                  <label>
                    {t('intern.form.mission')}
                    <input value={draft.poste} onChange={(e) => set('poste', e.target.value)} />
                    {fieldError('poste')}
                  </label>
                  <label>
                    {t('intern.form.department')}
                    <input value={draft.departement} onChange={(e) => set('departement', e.target.value)} />
                  </label>
                  <label>
                    {t('intern.form.tutor')}
                    <select value={draft.tuteur} onChange={(e) => set('tuteur', e.target.value)}>
                      <option value="">{t('intern.form.tutorOption')}</option>
                      {admins.map((admin) => (
                        <option key={admin._id} value={admin._id}>
                          {admin.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span />
                  <label>
                    {t('intern.form.startDate')}
                    <input type="date" value={draft.dateDebut} onChange={(e) => set('dateDebut', e.target.value)} />
                  </label>
                  <label>
                    {t('intern.form.endDate')}
                    <input type="date" value={draft.dateFin} onChange={(e) => set('dateFin', e.target.value)} />
                    {months !== null && (
                      <span className="mw-hint">{t('intern.member.duration', { count: months })}</span>
                    )}
                  </label>
                  {fieldError('dates')}
                  <div className="mw-span">
                    {t('intern.form.presenceDays')}
                    <div className="mw-chips">
                      {INTERN_DAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          className={`mw-chip ${draft.joursPresence.includes(day) ? 'is-on' : ''}`}
                          aria-pressed={draft.joursPresence.includes(day)}
                          onClick={() => toggleDay(day)}
                        >
                          {t(INTERN_DAY_LABEL_KEYS[day])}
                        </button>
                      ))}
                    </div>
                    <div className="mw-chips">
                      {PRESETS.map((preset) => (
                        <button
                          key={preset.key}
                          type="button"
                          className="mw-link"
                          onClick={() => set('joursPresence', preset.days)}
                        >
                          {t(preset.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label>
                    {t('intern.form.school')}
                    <input value={draft.ecole} onChange={(e) => set('ecole', e.target.value)} />
                  </label>
                  <label>
                    {t('intern.form.training')}
                    <input value={draft.formation} onChange={(e) => set('formation', e.target.value)} />
                  </label>
                  <label className="mw-span">
                    {t('intern.form.internalNotes')}
                    <textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                  </label>
                </div>
              )}

              {step === 'access' && (
                <>
                  <label className="mw-check">
                    <input
                      type="checkbox"
                      checked={draft.sendInvitation}
                      onChange={(e) => set('sendInvitation', e.target.checked)}
                    />
                    {t('intern.member.access.sendInvitation')}
                  </label>
                  <p className="mw-hint">{t('intern.member.access.explain')}</p>
                  <dl className="mw-recap">
                    <dt>{t('intern.member.recap.status')}</dt>
                    <dd>{selected ? t(selected.label) : ''}</dd>
                    <dt>{t('intern.form.fullName')}</dt>
                    <dd>{draft.name}</dd>
                    <dt>{t('intern.form.email')}</dt>
                    <dd>{draft.email}</dd>
                    {intern && (
                      <>
                        <dt>{t('intern.form.mission')}</dt>
                        <dd>{draft.poste}</dd>
                        <dt>{t('intern.member.recap.period')}</dt>
                        <dd>
                          {draft.dateDebut} → {draft.dateFin}
                        </dd>
                      </>
                    )}
                  </dl>
                  {(kind === 'SUPER_ADMIN' || kind === 'ADMIN') && (
                    <p className="mw-warn">{t('intern.member.access.sensitive')}</p>
                  )}
                  {error && (
                    <p className="mw-error" role="alert">
                      {error}
                    </p>
                  )}
                </>
              )}
            </div>

            <footer className="mw-foot">
              <button type="button" className="ticket-back-btn" onClick={stepIndex === 0 ? onClose : back}>
                {stepIndex === 0 ? t('intern.form.cancel') : t('intern.member.wizard.back')}
              </button>
              {step === 'access' ? (
                <button type="button" className="ticket-new-btn" disabled={submitting} onClick={submit}>
                  {submitting ? t('intern.form.submitting') : t('intern.member.wizard.create')}
                </button>
              ) : (
                <button type="button" className="ticket-new-btn" onClick={next}>
                  {t('intern.member.wizard.next')}
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
