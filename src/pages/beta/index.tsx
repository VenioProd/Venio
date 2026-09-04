import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ExternalLink, MessageSquare } from 'lucide-react'
import {
  addComment,
  listComments,
  loadSession,
  type TesterComment,
  type TesterRun,
  type TesterSession,
} from '../../services/betaTester'
import SEO from '../../components/SEO'
import ScenarioCard from './ScenarioCard'
import './BetaTester.css'

export default function BetaTesterSpace() {
  const { token } = useParams<{ token: string }>()
  const [session, setSession] = useState<TesterSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!token) return
    try {
      setSession(await loadSession(token))
      setError(null)
    } catch {
      // Le serveur répond la même chose pour un lien inconnu, révoqué ou
      // périmé : on reprend ce message unique, sans en dire plus.
      setError('Ce lien n’est plus valable. Demandez-en un nouveau à votre contact.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  const runsByScenario = useMemo(() => {
    const map = new Map<string, { mine?: TesterRun; others: TesterRun[] }>()
    for (const run of session?.runs ?? []) {
      const entry = map.get(run.scenario) ?? { others: [] }
      if (run.mine) entry.mine = run
      else entry.others.push(run)
      map.set(run.scenario, entry)
    }
    return map
  }, [session])

  // La page est atteignable sans compte : on la tient hors des moteurs de
  // recherche, quel que soit l'état de chargement.
  const seo = <SEO title="Beta test" description="Espace de test réservé aux testeurs invités." noindex />

  if (loading)
    return (
      <main className="bt-shell">
        {seo}
        <p>Chargement…</p>
      </main>
    )
  if (error) {
    return (
      <main className="bt-shell">
        {seo}
        <div className="bt-gate">
          <h1>Lien indisponible</h1>
          <p>{error}</p>
        </div>
      </main>
    )
  }
  if (!session || !token) return null

  const tested = session.runs.filter((run) => run.mine).length
  const total = session.scenarios.length
  const myFindings = session.runs.filter((run) => run.mine && run.verdict !== 'WORKS')

  return (
    <main className="bt-shell">
      {seo}
      <header className="bt-header">
        <p className="bt-hello">Bonjour {session.tester.name}</p>
        <h1>{session.campaign.name}</h1>
        {session.campaign.description && <p className="bt-desc">{session.campaign.description}</p>}

        <div className="bt-header-row">
          {session.campaign.targetUrl && (
            <a className="bt-btn bt-btn-primary" href={session.campaign.targetUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden /> Ouvrir le site à tester
            </a>
          )}
          <div className="bt-progress" role="status">
            <span className="bt-progress-count">
              {tested} / {total}
            </span>
            <span className="bt-hint">démarches testées</span>
            <div className="bt-progress-bar" aria-hidden>
              <span style={{ width: total === 0 ? '0%' : `${Math.round((tested / total) * 100)}%` }} />
            </div>
          </div>
        </div>

        {session.campaign.endsAt && (
          <p className="bt-hint">
            La campagne se termine le{' '}
            {new Date(session.campaign.endsAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
            })}
            .
          </p>
        )}
      </header>

      {session.scenarios.length === 0 && (
        <p className="bt-desc">Rien à tester pour l’instant. Revenez un peu plus tard.</p>
      )}

      {session.scenarios.map((scenario) => {
        const entry = runsByScenario.get(scenario._id)
        return (
          <ScenarioCard
            key={scenario._id}
            token={token}
            testedUrl={session.campaign.targetUrl}
            scenario={scenario}
            myRun={entry?.mine}
            othersRuns={entry?.others ?? []}
            onSubmitted={() => void reload()}
          />
        )
      })}

      {myFindings.length > 0 && (
        <section className="bt-card">
          <h2>Mes retours et les réponses de l’équipe</h2>
          {myFindings.map((run) => (
            <Thread key={run._id} token={token} run={run} />
          ))}
        </section>
      )}
    </main>
  )
}

function Thread({ token, run }: { token: string; run: TesterRun }) {
  const [comments, setComments] = useState<TesterComment[] | null>(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    const { comments: loaded } = await listComments(token, run._id)
    setComments(loaded)
  }, [token, run._id])

  return (
    <article className="bt-thread">
      <header>
        <strong>{run.title || 'Retour sans titre'}</strong>
        {run.status === 'FIXED' && <span className="bt-badge bt-badge-ok">Corrigé, à revérifier</span>}
        {run.status === 'ACKNOWLEDGED' && <span className="bt-badge">Pris en compte</span>}
        {run.status === 'REJECTED' && <span className="bt-badge">Classé sans suite</span>}
      </header>

      {comments === null ? (
        <button type="button" className="bt-btn bt-btn-small" onClick={() => void load()}>
          <MessageSquare size={12} aria-hidden /> Voir la discussion
        </button>
      ) : (
        <>
          {comments.length === 0 && <p className="bt-hint">Aucun message pour l’instant.</p>}
          {comments.map((comment) => (
            <p key={comment._id} className={`bt-message bt-message-${comment.author}`}>
              <span className="bt-message-author">{comment.author === 'me' ? 'Vous' : 'L’équipe'}</span>
              {comment.body}
            </p>
          ))}
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (!draft.trim()) return
              await addComment(token, run._id, draft)
              setDraft('')
              await load()
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder="Ajouter une précision…"
              aria-label="Votre message"
            />
            <button type="submit" className="bt-btn bt-btn-small" disabled={!draft.trim()}>
              Envoyer
            </button>
          </form>
        </>
      )}
    </article>
  )
}
