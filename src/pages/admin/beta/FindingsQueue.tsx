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
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import {
  REPRODUCIBILITY_LABEL_KEY,
  RUN_STATUS_LABEL_KEY,
  SEVERITY_LABEL_KEY,
  VERDICT_LABEL_KEY,
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
  const { t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  const findings = runs.filter((run) => run.verdict !== 'WORKS')

  if (findings.length === 0) {
    return <p className="beta-muted">{t('beta.findings.empty')}</p>
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
            <span className="beta-finding-title">{run.title || t(VERDICT_LABEL_KEY[run.verdict])}</span>
            <span className="beta-finding-tags">
              {run.severity && <span className="beta-chip">{t(SEVERITY_LABEL_KEY[run.severity])}</span>}
              <span className={`beta-chip beta-chip-${run.status === 'OPEN' ? 'warn' : 'neutral'}`}>
                {t(RUN_STATUS_LABEL_KEY[run.status])}
              </span>
              {run.confirmationCount > 0 && (
                <span className="beta-chip">{t('beta.findings.confirmedBy', { count: run.confirmationCount })}</span>
              )}
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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('beta.findings.actionFailed'))
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
            <dt>{t('beta.shared.scenario')}</dt>
            <dd>
              {scenario.identifier} — {scenario.title}
              {run.failedStep && (
                <span className="beta-muted">{t('beta.findings.failedStep', { step: run.failedStep })}</span>
              )}
            </dd>
          </>
        )}
        <dt>{t('beta.findings.reportedBy')}</dt>
        <dd>
          {run.tester?.name ?? run.user?.name ?? t('beta.shared.team')} · {formatRelative(run.createdAt)}
        </dd>
        {run.reproducibility && (
          <>
            <dt>{t('beta.findings.reproducibility')}</dt>
            <dd>{t(REPRODUCIBILITY_LABEL_KEY[run.reproducibility as keyof typeof REPRODUCIBILITY_LABEL_KEY])}</dd>
          </>
        )}
        {run.context && (
          <>
            <dt>{t('beta.findings.context')}</dt>
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
            <Ticket size={14} aria-hidden /> {t('beta.findings.openIssue')}
          </button>
        )}
        {run.status !== 'ACKNOWLEDGED' && (
          <button
            type="button"
            className="beta-btn"
            disabled={busy}
            onClick={() => act(() => updateRunStatus(run._id, 'ACKNOWLEDGED'))}
          >
            <CheckCheck size={14} aria-hidden /> {t('beta.findings.acknowledge')}
          </button>
        )}
        {run.status !== 'REJECTED' && (
          <button
            type="button"
            className="beta-btn"
            disabled={busy}
            onClick={() => act(() => updateRunStatus(run._id, 'REJECTED'))}
          >
            <X size={14} aria-hidden /> {t('beta.findings.dismiss')}
          </button>
        )}
        {comments === null && (
          <button type="button" className="beta-btn" onClick={() => void loadComments()}>
            <MessageSquare size={14} aria-hidden /> {t('beta.findings.seeThread')}
          </button>
        )}
      </div>

      {comments !== null && (
        <div className="beta-thread">
          {comments.length === 0 && <p className="beta-muted">{t('beta.findings.nobodyWrote')}</p>}
          {comments.map((comment) => (
            <article key={comment._id} className="beta-message">
              <header>
                <strong>{comment.authorTester?.name ?? comment.authorUser?.name ?? t('beta.shared.team')}</strong>
                <span className="beta-muted">{formatRelative(comment.createdAt)}</span>
                {!comment.visibleToTester && <span className="beta-chip">{t('beta.findings.internalNote')}</span>}
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
              placeholder={t('beta.findings.replyPlaceholder')}
            />
            <label className="beta-checkbox">
              <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
              {t('beta.findings.internalCheckbox')}
            </label>
            <button type="submit" className="beta-btn beta-btn-primary" disabled={!draft.trim()}>
              {t('beta.shared.send')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
