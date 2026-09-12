import { useState } from 'react'
import {
  addDevIssueComment,
  updateDevIssue,
  STATUS_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevIssueEvent,
} from '../../../services/dev'

export function criterion(value: string) {
  return { checked: /^\s*(?:-\s*)?\[x\]/i.test(value), label: value.replace(/^\s*(?:-\s*)?\[[ x]\]\s*/i, '') }
}

export function productionEvidence(issue: DevIssue, events: DevIssueEvent[]): string {
  const event = [...events]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .find(
      (e) =>
        e.type === 'deployed' && ['prod', 'production'].includes(String(e.metadata.environment).trim().toLowerCase()),
    )
  if (!event) return 'Non confirmée'
  const status = String(event.metadata.status).toLowerCase()
  if (['failed', 'failure', 'error'].includes(status)) return 'Dernier déploiement en échec'
  if (!['success', 'succeeded', 'completed'].includes(status)) return 'Déploiement non confirmé'
  const sha = event.metadata.commitSha ?? (event.metadata.github as { commitSha?: string } | undefined)?.commitSha
  const health = event.metadata.healthcheck as { status?: string } | undefined
  if (
    typeof sha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(sha) ||
    !issue.github?.commitSha ||
    sha.toLowerCase() !== issue.github.commitSha.toLowerCase()
  )
    return 'Déploiement observé, version à vérifier'
  const observed = new Date(event.createdAt).toLocaleString('fr-FR')
  return health?.status === 'healthy'
    ? `Disponibilité vérifiée le ${observed} · ${sha.slice(0, 7)}`
    : `Déployé le ${observed} · ${sha.slice(0, 7)} · disponibilité à vérifier`
}

export function ReviewEvidence({
  issue,
  comments,
  events,
  onUpdated,
  onEvidence,
  onBusy,
  canManage = false,
}: {
  canManage?: boolean
  issue: DevIssue
  comments: DevIssueComment[]
  events: DevIssueEvent[]
  onUpdated: (issue: DevIssue) => void
  onEvidence: (comment: DevIssueComment) => void
  onBusy: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  async function toggle(index: number, checked: boolean) {
    if (!canManage || busy) return
    const values = (issue.acceptanceCriteria ?? []).map((value, i) =>
      i === index ? `[${checked ? 'x' : ' '}] ${criterion(value).label}` : value,
    )
    setBusy(true)
    onBusy(true)
    setError(null)
    try {
      onUpdated(await updateDevIssue(issue._id, { acceptanceCriteria: values }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Critère non enregistré')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  async function saveEvidence() {
    if (!body.trim() || !canManage || busy) return
    setBusy(true)
    onBusy(true)
    setError(null)
    try {
      const comment = await addDevIssueComment(issue._id, { body: body.trim(), kind: 'EVIDENCE' })
      onEvidence(comment)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preuve non enregistrée')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const evidence = comments.filter((comment) => comment.kind === 'EVIDENCE')
  return (
    <section className="review-evidence" aria-label="Critères et preuves de validation">
      <h4>État de livraison</h4>
      <dl className="review-delivery-states">
        <div>
          <dt>Développement</dt>
          <dd>{STATUS_LABEL[issue.status]}</dd>
        </div>
        <div>
          <dt>Fusion</dt>
          <dd>
            {issue.github?.mergedAt
              ? `Fusionné le ${new Date(issue.github.mergedAt).toLocaleDateString('fr-FR')}`
              : issue.github?.prUrl
                ? 'Non confirmée'
                : 'Aucune PR liée'}
          </dd>
        </div>
        <div>
          <dt>Production</dt>
          <dd>{productionEvidence(issue, events)}</dd>
        </div>
      </dl>
      <h4>Critères d’acceptation</h4>
      {(issue.acceptanceCriteria ?? []).length === 0 ? (
        <p>Aucun critère défini pour cette tâche.</p>
      ) : (
        (issue.acceptanceCriteria ?? []).map((value, index) => {
          const item = criterion(value)
          return (
            <label className="review-criterion" key={`${index}-${item.label}`}>
              <input
                type="checkbox"
                checked={item.checked}
                disabled={busy || !canManage}
                onChange={(e) => {
                  void toggle(index, e.target.checked)
                }}
              />
              <span>{item.label}</span>
            </label>
          )
        })
      )}
      {issue.executionProfile?.verificationPlan && (
        <details>
          <summary>Vérification prévue</summary>
          <p className="review-queue-comment-body">{issue.executionProfile.verificationPlan}</p>
        </details>
      )}
      <h4>Tests et preuves</h4>
      {evidence.length === 0 ? (
        <p>Aucune preuve consignée. Ajoutez les vérifications utiles à cette tâche.</p>
      ) : (
        evidence.map((comment) => (
          <div className="review-queue-comment" key={comment._id}>
            <div className="review-queue-comment-body">{comment.body}</div>
          </div>
        ))
      )}
      <label className="review-evidence-input">
        Nouvelle preuve
        <textarea
          disabled={!canManage || busy}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tests exécutés, résultat, lien vers la recette ou le déploiement…"
        />
      </label>
      <button
        className="dev-btn"
        disabled={busy || !body.trim() || !canManage}
        onClick={() => {
          void saveEvidence()
        }}
      >
        Enregistrer la preuve
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="review-queue-muted">
        Valider termine la tâche. Les informations de fusion et de production restent indépendantes.
      </p>
    </section>
  )
}
