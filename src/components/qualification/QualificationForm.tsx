import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { trackPublicEvent } from '../../lib/publicAnalytics'
import { LineIcon } from '../graphics'
import {
  CHOICES,
  LAST_STEP,
  NEED_CARDS,
  STEP_COUNT,
  STEP_NAMES,
  STEP_TITLES,
  hasNeed,
  initialState,
  note,
  parsePreset,
  reco,
  releve,
  showsForAny,
  toPayload,
  validateStep,
} from './qualification'
import type { FieldName, QualificationState, StepError } from './qualification'
import './QualificationForm.css'

const CTA = 'qualification_form'
const SEND_ERROR =
  "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou nous écrire directement à contact@venio.paris"

type ArrayKey = 'need' | 'pain' | 'outilnow'
type SingleKey = 'formule' | 'marque' | 'taille' | 'quand' | 'budget' | 'decide' | 'reponse'

interface ChipsProps {
  legend: ReactNode
  hint?: ReactNode
  options: readonly (readonly [string, string])[]
  value: string | readonly string[] | null
  multi?: boolean
  onToggle: (v: string) => void
}

/** Groupe de puces : boutons `aria-pressed`, sélection simple ou multiple. */
const Chips = ({ legend, hint, options, value, multi, onToggle }: ChipsProps) => {
  const id = useId()
  const isOn = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div className="qf-block">
      <p className="qf-q" id={id}>
        {legend}
      </p>
      <div className="chips" role="group" aria-labelledby={id} data-multi={multi ? '' : undefined}>
        {options.map(([v, label]) => (
          <button key={v} type="button" className="chip" aria-pressed={isOn(v)} onClick={() => onToggle(v)}>
            {label}
          </button>
        ))}
      </div>
      {hint}
    </div>
  )
}

const QualificationForm = () => {
  const uid = useId()
  const location = useLocation()
  const preset = useMemo(() => parsePreset(location.search), [location.search])

  const [s, setS] = useState<QualificationState>(() => ({
    ...initialState(),
    need: preset.need,
    formule: preset.formule,
  }))
  const [step, setStep] = useState(preset.need.length > 0 ? 1 : 0)
  const [back, setBack] = useState(false)
  const [error, setError] = useState<StepError | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [website, setWebsite] = useState('')

  const formRef = useRef<HTMLFormElement>(null)
  const legendRef = useRef<HTMLLegendElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)
  // Le serveur refuse toute soumission de moins de 1,5 s : l'horloge part au montage.
  const [startedAt] = useState(() => Date.now())
  const started = useRef(false)
  const mounted = useRef(false)

  const touch = useCallback(() => {
    if (started.current) return
    started.current = true
    trackPublicEvent('contact_form_started', CTA)
  }, [])

  const patch = useCallback(
    (p: Partial<QualificationState>) => {
      touch()
      setS((prev) => ({ ...prev, ...p }))
    },
    [touch],
  )

  const toggleIn = (key: ArrayKey, v: string) => {
    setS((prev) => {
      const list = prev[key] as string[]
      return { ...prev, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }
    })
    touch()
    if (key === 'need') setError(null)
  }
  const pick = (key: SingleKey, v: string) => {
    touch()
    setS((prev) => ({ ...prev, [key]: prev[key] === v ? null : v }))
  }

  // Le focus suit l'étape : lecteurs d'écran et clavier repartent de la légende.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (done) doneRef.current?.focus()
    else legendRef.current?.focus()
  }, [step, done])

  const goTo = (n: number, isBack: boolean) => {
    setBack(isBack)
    setError(null)
    setStep(n)
  }

  const submit = async () => {
    setSending(true)
    trackPublicEvent('contact_form_submitted', CTA)
    try {
      await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(s, { startedAt, website })),
      })
      trackPublicEvent('contact_form_succeeded', CTA)
      setDone(true)
    } catch {
      setError({ message: SEND_ERROR, fields: [] })
      trackPublicEvent('contact_form_failed', CTA)
    } finally {
      setSending(false)
    }
  }

  const next = () => {
    if (sending) return
    const err = validateStep(step, s)
    if (err) {
      setError(err)
      if (err.fields[0]) formRef.current?.querySelector<HTMLElement>(`[data-field="${err.fields[0]}"]`)?.focus()
      return
    }
    setError(null)
    if (step === LAST_STEP) {
      void submit()
      return
    }
    goTo(step + 1, false)
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    next()
  }

  const bad = (f: FieldName) => error?.fields.includes(f) ?? false
  const errId = `${uid}-err`
  const fieldProps = (f: FieldName) => ({
    'data-field': f,
    'aria-invalid': bad(f) || undefined,
    'aria-describedby': bad(f) ? errId : undefined,
    className: bad(f) ? 'in bad' : 'in',
  })

  const rows = releve(s)
  const recos = reco(s)
  const remark = note(s)
  const showBudgetNote = remark !== '' && s.budget !== null

  const errorEl = error && (
    <p className="qf-err" id={errId} role="alert">
      {error.message}
    </p>
  )

  const siteUrlField = (idSuffix: string, label: ReactNode) => (
    <div className="qf-block">
      <label className="qf-q" htmlFor={`${uid}-${idSuffix}`}>
        {label}
      </label>
      <input
        {...fieldProps('siteUrl')}
        id={`${uid}-${idSuffix}`}
        type="url"
        inputMode="url"
        placeholder="https://"
        autoComplete="url"
        maxLength={300}
        value={s.siteUrl}
        onChange={(e) => patch({ siteUrl: e.target.value })}
      />
    </div>
  )

  const legend = (
    <legend ref={legendRef} tabIndex={-1}>
      {STEP_TITLES[step]}
    </legend>
  )

  const stepClass = `qf-step${back ? ' back' : ''}`

  return (
    <form className="qf" ref={formRef} onSubmit={onSubmit} noValidate aria-label="Formulaire de qualification">
      <div className="qf-main">
        <ol className="qf-prog" aria-label="Progression">
          {STEP_NAMES.map((name, i) => {
            const state = done || i < step ? 'done' : i === step ? 'cur' : ''
            const clickable = !done && i < step
            const node = <span className="node">{String(i + 1).padStart(2, '0')}</span>
            return (
              <li key={name} className={state} aria-current={i === step && !done ? 'step' : undefined}>
                {clickable ? (
                  <button
                    type="button"
                    className="qf-prog-btn"
                    aria-label={`Revenir à l'étape ${i + 1} : ${name}`}
                    onClick={() => goTo(i, true)}
                  >
                    {node}
                    <em>{name}</em>
                  </button>
                ) : (
                  <>
                    {node}
                    <em>{name}</em>
                  </>
                )}
              </li>
            )
          })}
          <span className="qf-bar" aria-hidden="true">
            <i style={{ width: `${(done ? 1 : Math.min(step, LAST_STEP) / LAST_STEP) * 100}%` }} />
          </span>
        </ol>

        {done ? (
          <div className="qf-step qf-done">
            <span className="done-ic" aria-hidden="true">
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" pathLength="1" />
                <path d="M15 27l7 7 15-16" pathLength="1" />
              </svg>
            </span>
            <h2 ref={doneRef} tabIndex={-1}>
              C'est noté{s.prenom.trim() ? `, ${s.prenom.trim()}` : ''}.
            </h2>
            <p className="qf-sub">
              On relit votre relevé et on vous répond sous 48 h ouvrées,{' '}
              {s.reponse === 'appel' ? "pour convenir d'un appel de 30 minutes" : 'par écrit'}. Si votre projet n'est
              pas pour nous, on vous le dit, et on vous oriente ailleurs.
            </p>
          </div>
        ) : (
          <>
            {step === 0 && (
              <fieldset className={stepClass} key="s0">
                {legend}
                <p className="qf-hint">Plusieurs réponses possibles.</p>
                <div className="cards">
                  {NEED_CARDS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="card"
                      aria-pressed={hasNeed(s, c.key)}
                      onClick={() => toggleIn('need', c.key)}
                    >
                      <span className="ic">
                        <LineIcon name={c.icon} size="sm" />
                      </span>
                      <b>{c.title}</b>
                      <small>{c.hint}</small>
                    </button>
                  ))}
                </div>
                {errorEl}
              </fieldset>
            )}

            {step === 1 && (
              <fieldset className={stepClass} key="s1">
                {legend}
                {showsForAny(s, ['site', 'refonte']) && (
                  <Chips
                    legend="Que doit faire le site ?"
                    options={CHOICES.formule}
                    value={s.formule}
                    onToggle={(v) => pick('formule', v)}
                  />
                )}
                {hasNeed(s, 'refonte') && siteUrlField('url', "L'adresse du site actuel")}
                {hasNeed(s, 'com') && (
                  <Chips
                    legend="Qu'est-ce qui coince aujourd'hui ?"
                    options={CHOICES.pain}
                    value={s.pain}
                    multi
                    onToggle={(v) => toggleIn('pain', v)}
                  />
                )}
                {hasNeed(s, 'marque') && (
                  <Chips
                    legend="Où en est votre marque ?"
                    options={CHOICES.marque}
                    value={s.marque}
                    onToggle={(v) => pick('marque', v)}
                  />
                )}
                {hasNeed(s, 'outil') && (
                  <Chips
                    legend="Aujourd'hui, ça tourne sur…"
                    options={CHOICES.outilnow}
                    value={s.outilnow}
                    multi
                    onToggle={(v) => toggleIn('outilnow', v)}
                  />
                )}
                {hasNeed(s, 'flou') && (
                  <div className="qf-block">
                    <label className="qf-q" htmlFor={`${uid}-flou`}>
                      Racontez ce qui vous bloque, en deux lignes.
                    </label>
                    <textarea
                      className="in"
                      id={`${uid}-flou`}
                      rows={3}
                      maxLength={1000}
                      placeholder="Ex. : on a un site, des réseaux, un peu de pub, mais les demandes ne viennent pas."
                      value={s.flou}
                      onChange={(e) => patch({ flou: e.target.value })}
                    />
                  </div>
                )}
                {errorEl}
              </fieldset>
            )}

            {step === 2 && (
              <fieldset className={stepClass} key="s2">
                {legend}
                <div className="qf-block">
                  <label className="qf-q" htmlFor={`${uid}-act`}>
                    Votre activité, en quelques mots
                  </label>
                  <input
                    className="in"
                    id={`${uid}-act`}
                    type="text"
                    maxLength={200}
                    placeholder="Ex. : cabinet d'avocats en droit social, 3 associés"
                    autoComplete="organization"
                    value={s.activite}
                    onChange={(e) => patch({ activite: e.target.value })}
                  />
                </div>
                <Chips
                  legend="Combien êtes-vous ?"
                  options={CHOICES.taille}
                  value={s.taille}
                  onToggle={(v) => pick('taille', v)}
                />
                {!hasNeed(s, 'refonte') && siteUrlField('url2', "Votre site actuel, s'il existe")}
                {errorEl}
              </fieldset>
            )}

            {step === 3 && (
              <fieldset className={stepClass} key="s3">
                {legend}
                <Chips
                  legend="Pour quand ?"
                  options={CHOICES.quand}
                  value={s.quand}
                  onToggle={(v) => pick('quand', v)}
                />
                <Chips
                  legend="Quel budget envisagez-vous ?"
                  options={CHOICES.budget}
                  value={s.budget}
                  onToggle={(v) => pick('budget', v)}
                  hint={showBudgetNote ? <p className="qf-note">{remark}</p> : undefined}
                />
                <Chips
                  legend="Qui décide ?"
                  options={CHOICES.decide}
                  value={s.decide}
                  onToggle={(v) => pick('decide', v)}
                />
                {errorEl}
              </fieldset>
            )}

            {step === 4 && (
              <fieldset className={stepClass} key="s4">
                {legend}
                <div className="qf-2">
                  <div className="qf-block">
                    <label className="qf-q" htmlFor={`${uid}-pre`}>
                      Prénom
                    </label>
                    <input
                      {...fieldProps('prenom')}
                      id={`${uid}-pre`}
                      type="text"
                      autoComplete="given-name"
                      maxLength={80}
                      required
                      value={s.prenom}
                      onChange={(e) => patch({ prenom: e.target.value })}
                    />
                  </div>
                  <div className="qf-block">
                    <label className="qf-q" htmlFor={`${uid}-nom`}>
                      Nom
                    </label>
                    <input
                      className="in"
                      id={`${uid}-nom`}
                      type="text"
                      autoComplete="family-name"
                      maxLength={80}
                      value={s.nom}
                      onChange={(e) => patch({ nom: e.target.value })}
                    />
                  </div>
                </div>
                <div className="qf-2">
                  <div className="qf-block">
                    <label className="qf-q" htmlFor={`${uid}-mail`}>
                      E-mail
                    </label>
                    <input
                      {...fieldProps('email')}
                      id={`${uid}-mail`}
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      value={s.email}
                      onChange={(e) => patch({ email: e.target.value })}
                    />
                  </div>
                  <div className="qf-block">
                    <label className="qf-q" htmlFor={`${uid}-tel`}>
                      Téléphone <small>(facultatif)</small>
                    </label>
                    <input
                      className="in"
                      id={`${uid}-tel`}
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                      value={s.tel}
                      onChange={(e) => patch({ tel: e.target.value })}
                    />
                  </div>
                </div>
                <Chips
                  legend="Comment préférez-vous qu'on revienne vers vous ?"
                  options={CHOICES.reponse}
                  value={s.reponse}
                  onToggle={(v) => pick('reponse', v)}
                />
                <div className="qf-block">
                  <label className="qf-q" htmlFor={`${uid}-msg`}>
                    Autre chose à ajouter ? <small>(facultatif)</small>
                  </label>
                  <textarea
                    className="in"
                    id={`${uid}-msg`}
                    rows={3}
                    maxLength={3000}
                    value={s.message}
                    onChange={(e) => patch({ message: e.target.value })}
                  />
                </div>
                <div className="qf-honeypot" aria-hidden="true">
                  <label htmlFor={`${uid}-website`}>Site web</label>
                  <input
                    id={`${uid}-website`}
                    type="text"
                    name="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    autoComplete="off"
                    tabIndex={-1}
                  />
                </div>
                <label className="qf-consent">
                  <input
                    type="checkbox"
                    data-field="consent"
                    checked={s.consent}
                    onChange={(e) => patch({ consent: e.target.checked })}
                  />
                  <span>
                    J'accepte que Venio utilise ces informations pour me répondre. Rien d'autre. Voir la{' '}
                    <Link to="/confidentialite">politique de confidentialité</Link>.
                  </span>
                </label>
                {errorEl}
              </fieldset>
            )}

            <div className="qf-nav">
              <button
                type="button"
                className="qf-btn"
                disabled={step === 0 || sending}
                onClick={() => goTo(step - 1, true)}
              >
                ← Retour
              </button>
              <span className="qf-count">
                Étape {step + 1} sur {STEP_COUNT}
              </span>
              <button type="submit" className="qf-btn qf-btn--p" disabled={sending}>
                {step === LAST_STEP ? (sending ? 'Envoi…' : 'Envoyer ma demande →') : 'Continuer →'}
              </button>
            </div>
          </>
        )}
      </div>

      <aside className="qf-side" aria-live="polite" aria-label="Relevé de votre besoin">
        <div className="qf-side-h">
          <span>Relevé de votre besoin</span>
          <span className="qf-live">
            <b aria-hidden="true">●</b> En direct
          </span>
        </div>
        <div className="qf-side-b">
          <dl className="rel">
            {rows.map((r) => (
              <div key={r.label} className={r.value ? '' : 'ph'}>
                <dt>{r.label}</dt>
                <dd>{r.value || '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="reco">
            <span className="qf-side-label">Ce qu'on vous proposerait sans doute</span>
            <ul>
              {recos.length ? (
                recos.map((x) => <li key={x}>{x}</li>)
              ) : (
                <li className="empty">Répondez à la première question.</li>
              )}
            </ul>
          </div>
          {remark && <p className="qf-note">{remark}</p>}
        </div>
      </aside>
    </form>
  )
}

export default QualificationForm
