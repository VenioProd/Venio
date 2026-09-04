import { useRef, useState } from 'react'
import { AlertTriangle, Check, ImagePlus, Info, ThumbsUp, X } from 'lucide-react'
import {
  confirmRun,
  screenshotUrl,
  submitVerdict,
  uploadScreenshot,
  type TesterRun,
  type TesterScenario,
} from '../../services/betaTester'
import type { BetaReproducibility, BetaSeverity, BetaVerdict } from '../../services/beta'
import { splitPreconditions, toReadableStep } from './steps'
import { clearScenarioProgress, readProgress, writeChecked, writeDraft } from './progress'

const SEVERITIES: Array<{ id: BetaSeverity; label: string; hint: string }> = [
  { id: 'BLOCKER', label: 'Bloquant', hint: 'Impossible d’aller plus loin' },
  { id: 'MAJOR', label: 'Gênant', hint: 'Contournable, mais pénible' },
  { id: 'MINOR', label: 'Mineur', hint: 'Petit défaut sans gravité' },
  { id: 'COSMETIC', label: 'Cosmétique', hint: 'Une question d’apparence' },
]

const REPRODUCIBILITIES: Array<{ id: BetaReproducibility; label: string }> = [
  { id: 'ALWAYS', label: 'À chaque fois' },
  { id: 'SOMETIMES', label: 'De temps en temps' },
  { id: 'ONCE', label: 'Vu une seule fois' },
]

interface Props {
  token: string
  /** Identifie le testeur pour sa progression locale. */
  testerKey: string
  /** URL du site testé, rapportée avec le verdict. */
  testedUrl: string | null
  scenario: TesterScenario
  myRun: TesterRun | undefined
  othersRuns: TesterRun[]
  onSubmitted: () => void
  /** Remonte l'avancement des coches pour la vue d'ensemble. */
  onProgress?: (scenarioId: string, checked: number[]) => void
}

/**
 * Une démarche vue par le testeur : les étapes à suivre, les trois verdicts,
 * et le formulaire minimal qui s'ouvre seulement si quelque chose cloche.
 */
export default function ScenarioCard({
  token,
  testerKey,
  testedUrl,
  scenario,
  myRun,
  othersRuns,
  onSubmitted,
  onProgress,
}: Props) {
  // La saisie en cours survit à un rechargement : une campagne longue se
  // déroule en plusieurs sessions, et repartir de zéro décourage.
  const saved = readProgress(testerKey, scenario._id)
  const [checked, setChecked] = useState<Set<number>>(new Set(saved.checked))
  const [verdict, setVerdict] = useState<BetaVerdict | null>(myRun?.verdict ?? null)
  const [severity, setSeverity] = useState<BetaSeverity | null>(myRun?.severity ?? null)
  const [reproducibility, setReproducibility] = useState<BetaReproducibility | null>(myRun?.reproducibility ?? null)
  const [failedStep, setFailedStep] = useState<number | null>(myRun?.failedStep ?? null)
  const [title, setTitle] = useState(saved.draft?.title ?? myRun?.title ?? '')
  const [body, setBody] = useState(saved.draft?.body ?? myRun?.body ?? '')
  const [shots, setShots] = useState(myRun?.attachments ?? [])
  const [runId, setRunId] = useState(myRun?._id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function toggleStep(order: number) {
    setChecked((current) => {
      const next = new Set(current)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      writeChecked(testerKey, scenario._id, [...next])
      onProgress?.(scenario._id, [...next])
      return next
    })
  }

  /** Mémorise la saisie à chaque frappe, sans rien envoyer au serveur. */
  function rememberDraft(patch: Partial<{ verdict: BetaVerdict | null; title: string; body: string }>) {
    writeDraft(testerKey, scenario._id, { verdict, title, body, ...patch })
  }

  async function attach(files: FileList | File[] | null) {
    if (!files || !runId) return
    setError(null)
    for (const file of Array.from(files)) {
      try {
        setShots(await uploadScreenshot(token, runId, file))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Envoi de la capture impossible')
      }
    }
  }

  async function send() {
    if (!verdict) return
    setBusy(true)
    setError(null)
    try {
      const { run } = await submitVerdict(
        token,
        scenario._id,
        {
          verdict,
          severity: verdict === 'WORKS' || isBlocked ? null : severity,
          reproducibility: verdict === 'WORKS' || isBlocked ? null : reproducibility,
          failedStep,
          title,
          body,
        },
        testedUrl,
      )
      setRunId(run._id)
      setDone(true)
      clearScenarioProgress(testerKey, scenario._id)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  const isBlocked = verdict === 'BLOCKED'
  const needsDetail = verdict !== null && verdict !== 'WORKS'

  return (
    <section className="bt-card">
      <header className="bt-card-head">
        <div>
          <span className="bt-card-id">{scenario.identifier}</span>
          <h2>{scenario.title}</h2>
        </div>
        {myRun && !done && <span className="bt-badge">Déjà répondu</span>}
        {done && (
          <span className="bt-badge bt-badge-ok">
            <Check size={12} aria-hidden /> Envoyé
          </span>
        )}
      </header>

      {(() => {
        const { intro, conditions } = splitPreconditions(scenario.description ?? '')
        return (
          <>
            {intro && <p className="bt-desc">{intro}</p>}
            {conditions.length > 0 && (
              <ul className="bt-preconditions">
                {conditions.map((condition) => (
                  <li key={condition}>
                    <Info size={13} aria-hidden />
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      })()}

      {scenario.steps.length > 0 && (
        <ol className="bt-steps">
          {scenario.steps.map(toReadableStep).map((step) => (
            <li key={step.order}>
              <label>
                <input type="checkbox" checked={checked.has(step.order)} onChange={() => toggleStep(step.order)} />
                <span className="bt-step-text">
                  <strong>{step.instruction}</strong>
                  {step.expected && (
                    <span className="bt-step-expected">
                      <span className="bt-step-label">Attendu</span> {step.expected}
                    </span>
                  )}
                  {step.watchOut && (
                    <span className="bt-step-trap">
                      <AlertTriangle size={12} aria-hidden />
                      <span>
                        <span className="bt-step-label">Piège</span> {step.watchOut}
                      </span>
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ol>
      )}

      <div className="bt-verdicts" role="group" aria-label="Votre verdict">
        <button
          type="button"
          className={`bt-verdict bt-verdict-ok${verdict === 'WORKS' ? ' active' : ''}`}
          onClick={() => {
            setVerdict('WORKS')
            rememberDraft({ verdict: 'WORKS' })
          }}
          aria-pressed={verdict === 'WORKS'}
        >
          Ça fonctionne
        </button>
        <button
          type="button"
          className={`bt-verdict bt-verdict-fail${verdict === 'BROKEN' ? ' active' : ''}`}
          onClick={() => {
            setVerdict('BROKEN')
            rememberDraft({ verdict: 'BROKEN' })
          }}
          aria-pressed={verdict === 'BROKEN'}
        >
          Ça ne fonctionne pas
        </button>
        <button
          type="button"
          className={`bt-verdict bt-verdict-warn${verdict === 'TO_OPTIMIZE' ? ' active' : ''}`}
          onClick={() => {
            setVerdict('TO_OPTIMIZE')
            rememberDraft({ verdict: 'TO_OPTIMIZE' })
          }}
          aria-pressed={verdict === 'TO_OPTIMIZE'}
        >
          À optimiser
        </button>
        <button
          type="button"
          className={`bt-verdict bt-verdict-blocked${verdict === 'BLOCKED' ? ' active' : ''}`}
          onClick={() => {
            setVerdict('BLOCKED')
            rememberDraft({ verdict: 'BLOCKED' })
          }}
          aria-pressed={verdict === 'BLOCKED'}
        >
          Je n’ai pas pu tester
        </button>
      </div>

      {needsDetail && (
        <div className="bt-detail">
          <label>
            {isBlocked ? 'Qu’est-ce qui vous a empêché de tester\u00a0?' : 'En une phrase, qu’est-ce qui cloche\u00a0?'}
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                rememberDraft({ title: event.target.value })
              }}
              placeholder={
                isBlocked ? 'Je n’ai pas reçu l’accès à l’espace intervenant' : 'Le bouton Envoyer ne réagit pas'
              }
            />
          </label>

          {!isBlocked && scenario.steps.length > 0 && (
            <label>
              À quelle étape&nbsp;?
              <select
                value={failedStep ?? ''}
                onChange={(event) => setFailedStep(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">Pas une étape en particulier</option>
                {scenario.steps.map((step) => (
                  <option key={step.order} value={step.order}>
                    {step.order}.{' '}
                    {step.instruction.length > 60 ? `${step.instruction.slice(0, 58)}…` : step.instruction}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!isBlocked && (
            <fieldset>
              <legend>C’est à quel point gênant&nbsp;?</legend>
              <div className="bt-choices">
                {SEVERITIES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`bt-choice${severity === entry.id ? ' active' : ''}`}
                    onClick={() => setSeverity(entry.id)}
                    aria-pressed={severity === entry.id}
                  >
                    <strong>{entry.label}</strong>
                    <span>{entry.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {!isBlocked && (
            <fieldset>
              <legend>Ça arrive…</legend>
              <div className="bt-choices bt-choices-inline">
                {REPRODUCIBILITIES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`bt-choice${reproducibility === entry.id ? ' active' : ''}`}
                    onClick={() => setReproducibility(entry.id)}
                    aria-pressed={reproducibility === entry.id}
                  >
                    <strong>{entry.label}</strong>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label>
            {isBlocked ? 'Précisez, si besoin' : 'Racontez ce qui s’est passé'}
            <textarea
              value={body}
              onChange={(event) => {
                setBody(event.target.value)
                rememberDraft({ body: event.target.value })
              }}
              rows={3}
              placeholder="J’ai rempli le formulaire, cliqué sur Envoyer, et la page est restée figée."
              onPaste={(event) => {
                // Coller une capture est le geste naturel juste après l'avoir
                // prise : on l'accepte au même titre qu'un choix de fichier.
                const files = Array.from(event.clipboardData.files)
                if (files.length > 0) void attach(files)
              }}
            />
          </label>

          <div
            className="bt-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void attach(event.dataTransfer.files)
            }}
          >
            <button type="button" className="bt-btn" onClick={() => fileInput.current?.click()} disabled={!runId}>
              <ImagePlus size={14} aria-hidden /> Ajouter une capture
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(event) => void attach(event.target.files)}
            />
            <p className="bt-hint">
              {runId
                ? 'Glissez une image ici, ou collez-la directement avec Ctrl+V dans le champ ci-dessus.'
                : 'Envoyez d’abord votre retour, vous pourrez ensuite y joindre des captures.'}
            </p>
          </div>

          {shots.length > 0 && (
            <div className="bt-shots">
              {shots.map((shot) => (
                <img key={shot._id} src={runId ? screenshotUrl(token, runId, shot._id) : ''} alt={shot.originalName} />
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="bt-error">{error}</p>}

      {verdict && (
        <button type="button" className="bt-btn bt-btn-primary bt-send" onClick={send} disabled={busy}>
          {busy ? 'Envoi…' : myRun ? 'Mettre à jour mon retour' : 'Envoyer mon retour'}
        </button>
      )}

      {othersRuns.length > 0 && (
        <div className="bt-others">
          <h3>Déjà signalé sur cette démarche</h3>
          <ul>
            {othersRuns.map((run) => (
              <li key={run._id}>
                <span className="bt-others-title">{run.title || 'Problème signalé'}</span>
                <button
                  type="button"
                  className="bt-btn bt-btn-small"
                  disabled={run.confirmedByMe}
                  onClick={async () => {
                    await confirmRun(token, run._id)
                    onSubmitted()
                  }}
                >
                  {run.confirmedByMe ? (
                    <>
                      <Check size={12} aria-hidden /> Confirmé
                    </>
                  ) : (
                    <>
                      <ThumbsUp size={12} aria-hidden /> J’ai le même souci
                    </>
                  )}
                </button>
                {run.confirmationCount > 0 && (
                  <span className="bt-hint">{run.confirmationCount} personne(s) confirment</span>
                )}
                {run.status === 'FIXED' && <span className="bt-badge bt-badge-ok">Corrigé, à revérifier</span>}
                {run.status === 'REJECTED' && (
                  <span className="bt-badge">
                    <X size={11} aria-hidden /> Classé sans suite
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
