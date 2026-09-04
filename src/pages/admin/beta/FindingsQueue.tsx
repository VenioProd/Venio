import { useState } from 'react'
import { CheckCheck, ExternalLink, MessageSquare, Ticket, X } from 'lucide-react'
import {
  addRunComment,
  listRunComments,
  promoteRun,
  runAttachmentUrl,
  updateRunStatus,
  type BetaComment,
  type BetaRun,
} from '../../../services/beta'
import {
  REPRODUCIBILITY_LABEL,
  RUN_STATUS_LABEL,
  SEVERITY_LABEL,
  VERDICT_LABEL,
  describeContext,
  formatRelative,
  verdictTone,
} from './helpers'

interface Props {
  runs: BetaRun[]
  onChanged: () => void
}

/**
 * File de tri des retours. L'ordre vient du serveur (gravité, puis nombre de
 * confirmations) : on ne le rejoue pas ici, on l'affiche.
 */
export default function FindingsQueue({ runs, onChanged }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const findings = runs.filter((run) => run.verdict !== 'WORKS')

  if (findings.length === 0) {
    return <p className="beta-muted">Aucun problème signalé pour l’instant.</p>
  }

  return (
    <ul className="beta-findings">
      {findings.map((run) => (
        <li key={run._id} className={`beta-finding beta-finding-${verdictTone(run.verdict)}`}>
          <button
            type="button"
            className="beta-finding-head"
            onClick={() => setOpenId(openId === run._id ? null : run._id)}
            aria-expanded={openId === run._id}
          >
            <span className="beta-finding-title">{run.title || VERDICT_LABEL[run.verdict]}</span>
            <span className="beta-finding-tags">
              {run.severity && <span className="beta-chip">{SEVERITY_LABEL[run.severity]}</span>}
              <span className={`beta-chip beta-chip-${run.status === 'OPEN' ? 'warn' : 'neutral'}`}>
                {RUN_STATUS_LABEL[run.status]}
              </span>
              {run.confirmationCount > 0 && <span className="beta-chip">confirmé ×{run.confirmationCount}</span>}
              {run.devIssue && <span className="beta-chip beta-chip-link">{run.devIssue.identifier}</span>}
            </span>
          </button>

          {openId === run._id && <FindingDetail run={run} onChanged={onChanged} />}
        </li>
      ))}
    </ul>
  )
}

function FindingDetail({ run, onChanged }: { run: BetaRun; onChanged: () => void }) {
  const [comments, setComments] = useState<BetaComment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadComments() {
    const { comments: loaded } = await listRunComments(run._id)
    setComments(loaded)
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  const scenario = typeof run.scenario === 'object' ? run.scenario : null

  return (
    <div className="beta-finding-detail">
      <dl className="beta-finding-facts">
        {scenario && (
          <>
            <dt>Démarche</dt>
            <dd>
              {scenario.identifier} — {scenario.title}
              {run.failedStep && <span className="beta-muted"> · étape {run.failedStep}</span>}
            </dd>
          </>
        )}
        <dt>Signalé par</dt>
        <dd>
          {run.tester?.name ?? run.user?.name ?? 'Équipe'} · {formatRelative(run.createdAt)}
        </dd>
        {run.reproducibility && (
          <>
            <dt>Reproductibilité</dt>
            <dd>{REPRODUCIBILITY_LABEL[run.reproducibility]}</dd>
          </>
        )}
        {run.context && (
          <>
            <dt>Contexte</dt>
            <dd>
              {describeContext(run)}
              {run.context.url && (
                <a href={run.context.url} target="_blank" rel="noreferrer" className="beta-muted">
                  {' '}
                  <ExternalLink size={11} aria-hidden /> {run.context.url}
                </a>
              )}
              {run.context.userAgent && <div className="beta-muted beta-ua">{run.context.userAgent}</div>}
            </dd>
          </>
        )}
      </dl>

      {run.body && <p className="beta-finding-body">{run.body}</p>}

      {run.attachments.length > 0 && (
        <div className="beta-shots">
          {run.attachments.map((attachment) => (
            <a key={attachment._id} href={runAttachmentUrl(run._id, attachment._id)} target="_blank" rel="noreferrer">
              <img src={runAttachmentUrl(run._id, attachment._id)} alt={attachment.originalName} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {error && <p className="beta-error">{error}</p>}

      <div className="beta-finding-actions">
        {!run.devIssue && (
          <button
            type="button"
            className="beta-btn beta-btn-primary"
            disabled={busy}
            onClick={() => act(() => promoteRun(run._id))}
          >
            <Ticket size={14} aria-hidden /> Ouvrir une issue
          </button>
        )}
        {run.status !== 'ACKNOWLEDGED' && (
          <button
            type="button"
            className="beta-btn"
            disabled={busy}
            onClick={() => act(() => updateRunStatus(run._id, 'ACKNOWLEDGED'))}
          >
            <CheckCheck size={14} aria-hidden /> Prendre en compte
          </button>
        )}
        {run.status !== 'REJECTED' && (
          <button
            type="button"
            className="beta-btn"
            disabled={busy}
            onClick={() => act(() => updateRunStatus(run._id, 'REJECTED'))}
          >
            <X size={14} aria-hidden /> Sans suite
          </button>
        )}
        {comments === null && (
          <button type="button" className="beta-btn" onClick={() => void loadComments()}>
            <MessageSquare size={14} aria-hidden /> Voir le fil
          </button>
        )}
      </div>

      {comments !== null && (
        <div className="beta-thread">
          {comments.length === 0 && <p className="beta-muted">Personne n’a encore écrit ici.</p>}
          {comments.map((comment) => (
            <article key={comment._id} className="beta-message">
              <header>
                <strong>{comment.authorTester?.name ?? comment.authorUser?.name ?? 'Équipe'}</strong>
                <span className="beta-muted">{formatRelative(comment.createdAt)}</span>
                {!comment.visibleToTester && <span className="beta-chip">note interne</span>}
              </header>
              <p>{comment.body}</p>
            </article>
          ))}

          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!draft.trim()) return
              await addRunComment(run._id, draft, !internal)
              setDraft('')
              await loadComments()
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder="Répondre au testeur…"
            />
            <label className="beta-checkbox">
              <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
              Note interne, invisible du testeur
            </label>
            <button type="submit" className="beta-btn beta-btn-primary" disabled={!draft.trim()}>
              Envoyer
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
