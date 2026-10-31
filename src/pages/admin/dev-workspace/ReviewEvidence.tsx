import { useState } from 'react'
import {
  addDevIssueComment,
  updateDevIssue,
  STATUS_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevIssueEvent,
} from '../../../services/dev'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate, formatDateTime } from '../../../i18n/format'

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
  if (!event) return translate('devA.evidence.notConfirmed')
  const status = String(event.metadata.status).toLowerCase()
  if (['failed', 'failure', 'error'].includes(status)) return translate('devA.evidence.lastDeployFailed')
  if (!['success', 'succeeded', 'completed'].includes(status)) return translate('devA.evidence.deployUnconfirmed')
  const sha = event.metadata.commitSha ?? (event.metadata.github as { commitSha?: string } | undefined)?.commitSha
  const health = event.metadata.healthcheck as { status?: string } | undefined
  if (
    typeof sha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(sha) ||
    !issue.github?.commitSha ||
    sha.toLowerCase() !== issue.github.commitSha.toLowerCase()
  )
    return translate('devA.evidence.versionToCheck')
  const observed = formatDateTime(event.createdAt, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  return translate(health?.status === 'healthy' ? 'devA.evidence.healthy' : 'devA.evidence.deployedUnchecked', {
    date: observed,
    sha: sha.slice(0, 7),
  })
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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : t('devA.evidence.criterionError'))
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
      setError(err instanceof Error ? err.message : t('devA.evidence.evidenceError'))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  const evidence = comments.filter((comment) => comment.kind === 'EVIDENCE')
  return (
    <section className="review-evidence" aria-label={t('devA.evidence.aria')}>
      <h4>{t('devA.evidence.deliveryHeading')}</h4>
      <dl className="review-delivery-states">
        <div>
          <dt>{t('devA.evidence.development')}</dt>
          <dd>{STATUS_LABEL[issue.status]}</dd>
        </div>
        <div>
          <dt>{t('devA.evidence.merge')}</dt>
          <dd>
            {issue.github?.mergedAt
              ? t('devA.evidence.mergedOn', { date: formatDate(issue.github.mergedAt) })
              : issue.github?.prUrl
                ? t('devA.evidence.notConfirmed')
                : t('devA.evidence.noPr')}
          </dd>
        </div>
        <div>
          <dt>{t('devA.evidence.production')}</dt>
          <dd>{productionEvidence(issue, events)}</dd>
        </div>
      </dl>
      <h4>{t('devA.evidence.criteriaHeading')}</h4>
      {(issue.acceptanceCriteria ?? []).length === 0 ? (
        <p>{t('devA.evidence.noCriteria')}</p>
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
          <summary>{t('devA.evidence.verificationPlan')}</summary>
          <p className="review-queue-comment-body">{issue.executionProfile.verificationPlan}</p>
        </details>
      )}
      <h4>{t('devA.evidence.testsHeading')}</h4>
      {evidence.length === 0 ? (
        <p>{t('devA.evidence.noEvidence')}</p>
      ) : (
        evidence.map((comment) => (
          <div className="review-queue-comment" key={comment._id}>
            <div className="review-queue-comment-body">{comment.body}</div>
          </div>
        ))
      )}
      <label className="review-evidence-input">
        {t('devA.evidence.newEvidence')}
        <textarea
          disabled={!canManage || busy}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('devA.evidence.placeholder')}
        />
      </label>
      <button
        className="dev-btn"
        disabled={busy || !body.trim() || !canManage}
        onClick={() => {
          void saveEvidence()
        }}
      >
        {t('devA.evidence.save')}
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="review-queue-muted">{t('devA.evidence.footnote')}</p>
    </section>
  )
}
