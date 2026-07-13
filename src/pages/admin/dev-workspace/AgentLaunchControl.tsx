import { useEffect, useRef, useState } from 'react'
import { Bot, LoaderCircle, Play, ShieldCheck, X } from 'lucide-react'
import { ApiError } from '../../../lib/api'
import {
  fetchDevAgentLaunchAvailability,
  launchDevAgentRun,
  type DevAgentLaunchAvailability,
  type DevAgentRunResult,
} from '../../../services/dev'
import { useAuth } from '../../../context/AuthContext'
import './AgentLaunchControl.css'

interface AgentLaunchControlProps {
  projectId: string
  issueId: string
  issueIdentifier: string
  issueTitle: string
  recommendationId?: string | null
  availability?: DevAgentLaunchAvailability | null
  compact?: boolean
  onLaunched?: (result: DevAgentRunResult) => void
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `agent-run-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
    const payload = error.payload as { error?: unknown; status?: unknown }
    if (payload.status === 'BRIDGE_UNAVAILABLE')
      return 'Le bridge est devenu indisponible : aucun lancement n’a été simulé.'
    if (typeof payload.error === 'string') return payload.error
  }
  return error instanceof Error ? error.message : 'Le lancement n’a pas pu être préparé.'
}

/**
 * The browser only selects an existing issue/recommendation. Target, repository,
 * branch and execution context are resolved server-side after confirmation.
 */
export default function AgentLaunchControl({
  projectId,
  issueId,
  issueIdentifier,
  issueTitle,
  recommendationId = null,
  availability: suppliedAvailability,
  compact = false,
  onLaunched,
}: AgentLaunchControlProps) {
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [availability, setAvailability] = useState<DevAgentLaunchAvailability | null | undefined>(suppliedAvailability)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DevAgentRunResult | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)

  useEffect(() => {
    setAvailability(suppliedAvailability)
  }, [suppliedAvailability])

  useEffect(() => {
    if (!isSuperAdmin || suppliedAvailability !== undefined) return
    let cancelled = false
    void fetchDevAgentLaunchAvailability(projectId)
      .then((next) => {
        if (!cancelled) setAvailability(next)
      })
      .catch(() => {
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin, projectId, suppliedAvailability])

  if (!isSuperAdmin || !availability?.available || !availability.target || !availability.scope) return null

  const close = () => {
    if (submitting) return
    setOpen(false)
    setError(null)
    setResult(null)
    idempotencyKeyRef.current = null
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const idempotencyKey = idempotencyKeyRef.current ?? newIdempotencyKey()
    idempotencyKeyRef.current = idempotencyKey
    try {
      const next = await launchDevAgentRun(projectId, { issueId, recommendationId }, idempotencyKey)
      setResult(next)
      onLaunched?.(next)
    } catch (launchError) {
      setError(errorMessage(launchError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`agent-launch-button${compact ? ' compact' : ''}`}
        onClick={() => setOpen(true)}
        title={`Préparer ${availability.target.agent} / ${availability.target.model}`}
      >
        <Bot size={compact ? 12 : 14} /> Lancer l’agent
      </button>

      {open && (
        <div className="agent-launch-overlay" role="presentation" onMouseDown={close}>
          <section
            className="agent-launch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-launch-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="agent-launch-header">
              <div>
                <span className="agent-launch-kicker">
                  <ShieldCheck size={13} /> Lancement cadré
                </span>
                <h2 id="agent-launch-title">Confirmer la tâche agent</h2>
              </div>
              <button type="button" className="agent-launch-close" onClick={close} aria-label="Fermer">
                <X size={16} />
              </button>
            </header>

            {result ? (
              <div className="agent-launch-result" role="status">
                <strong>Exécution {result.status.toLowerCase()}</strong>
                <span>
                  ID : <code>{result.executionId}</code>
                </span>
                {result.replayed && <span>Réponse idempotente réutilisée.</span>}
                <button type="button" className="agent-launch-button" onClick={close}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <dl className="agent-launch-scope">
                  <div>
                    <dt>Agent</dt>
                    <dd>
                      {availability.target.agent} · {availability.target.model}
                    </dd>
                  </div>
                  <div>
                    <dt>Issue</dt>
                    <dd>
                      {issueIdentifier} · {issueTitle}
                    </dd>
                  </div>
                  {recommendationId && (
                    <div>
                      <dt>Origine</dt>
                      <dd>Recommandation vérifiée côté serveur</dd>
                    </div>
                  )}
                  <div>
                    <dt>Périmètre</dt>
                    <dd>
                      {availability.scope.repository} · branche {availability.scope.baseBranch}
                    </dd>
                  </div>
                </dl>
                <div className="agent-launch-limits">
                  <strong>Limites appliquées</strong>
                  <ul>
                    {availability.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </div>
                {error && (
                  <p className="agent-launch-error" role="alert">
                    {error}
                  </p>
                )}
                <footer className="agent-launch-actions">
                  <button type="button" className="agent-launch-cancel" onClick={close} disabled={submitting}>
                    Annuler
                  </button>
                  <button type="button" className="agent-launch-button primary" onClick={submit} disabled={submitting}>
                    {submitting ? (
                      <>
                        <LoaderCircle size={14} className="agent-launch-spin" /> Préparation…
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Confirmer le lancement
                      </>
                    )}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
