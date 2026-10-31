import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'
import UserAvatar from '../../components/UserAvatar'
import {
  clientFileUrl,
  getChangeRequest,
  replyToChangeRequest,
  requestChangeRequestCorrection,
  validateChangeRequest,
} from '../../services/changeRequests'
import type { ClientChangeRequest } from '../../types/changeRequest.types'
import type { MessageKey } from '../../i18n'
import {
  CLIENT_STATUS_CONFIG,
  PRIORITY_LABELS,
  formatChangeRequestDate,
  formatChangeRequestDateTime,
} from './changeRequestStatus'
import './ClientPortal.css'

/** Frise de suivi : « Qualification » agrège l'arbitrage incluse / à chiffrer. */
const STEPS = [
  { key: 'SOUMISE', labelKey: 'client.crStatus.submitted' },
  { key: 'QUALIFICATION', labelKey: 'client.crDetail.stepQualification' },
  { key: 'PLANIFIEE', labelKey: 'client.crStatus.planned' },
  { key: 'EN_COURS', labelKey: 'client.crStatus.inProgress' },
  { key: 'LIVREE', labelKey: 'client.crDetail.stepDelivered' },
  { key: 'VALIDEE', labelKey: 'client.crStatus.validated' },
] as const satisfies readonly { key: string; labelKey: MessageKey }[]

const STEP_ORDER: Record<string, number> = {
  SOUMISE: 0,
  A_CHIFFRER: 1,
  PLANIFIEE: 2,
  EN_COURS: 3,
  LIVREE: 4,
  VALIDEE: 5,
}

const ClientChangeRequestDetail = () => {
  const { t } = useI18n()
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [changeRequest, setChangeRequest] = useState<ClientChangeRequest | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [correction, setCorrection] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getChangeRequest(id)
      .then((data) => setChangeRequest(data.changeRequest))
      .catch((err: Error) => setError(err.message || t('client.crDetail.loadError')))
  }, [id, t])

  useEffect(load, [load])

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    try {
      await replyToChangeRequest(id, message.trim(), files)
      setMessage('')
      setFiles([])
      load()
    } catch (err) {
      setError((err as Error).message || t('client.crNew.sendError'))
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: () => Promise<{ changeRequest: ClientChangeRequest }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      setChangeRequest(result.changeRequest)
      load()
    } catch (err) {
      setError((err as Error).message || t('client.crDetail.actionError'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !changeRequest)
    return (
      <div className="portal-container">
        <p role="alert">{error}</p>
      </div>
    )
  if (!changeRequest)
    return (
      <div className="portal-container">
        <div className="portal-spinner" />
      </div>
    )

  const status = CLIENT_STATUS_CONFIG[changeRequest.status]
  const currentStep = STEP_ORDER[changeRequest.status] ?? 0
  // Le compte peut valider ; un collaborateur invité, non.
  const isAccountOwner = user?._id === changeRequest.client
  const qualificationLabel =
    changeRequest.qualification === 'INCLUSE'
      ? t('client.crDetail.qualIncluded')
      : changeRequest.qualification === 'A_CHIFFRER'
        ? t('client.crDetail.qualQuote')
        : ''

  return (
    <div className="portal-container">
      <Link to="/espace-client/demandes" className="portal-link">
        {t('client.crNew.backToList')}
      </Link>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <h1 style={{ margin: 0 }}>{changeRequest.title}</h1>
        <span className={`client-project-card-badge ${status.className}`}>{t(status.labelKey)}</span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        {t('client.crDetail.submittedBy', {
          date: formatChangeRequestDate(changeRequest.createdAt),
          name: changeRequest.createdByName,
        })}
      </p>

      {error && <p role="alert">{error}</p>}

      {changeRequest.status === 'REFUSEE' ? (
        <div className="portal-card" role="status" style={{ borderColor: 'var(--mono-danger-border, #ff5c5c)' }}>
          <strong>{t('client.crDetail.refusedTitle')}</strong>
          <p style={{ margin: '8px 0 0' }}>{changeRequest.refusalReason}</p>
        </div>
      ) : (
        <ol
          className="portal-card"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 16, listStyle: 'none', margin: '24px 0', padding: 20 }}
        >
          {STEPS.map((step, index) => {
            const done = index <= currentStep
            const entry = changeRequest.statusHistory.find((history) => history.status === step.key)
            return (
              <li key={step.key} style={{ flex: '1 1 120px', opacity: done ? 1 : 0.45 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t(step.labelKey)}</div>
                {step.key === 'QUALIFICATION' && qualificationLabel && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{qualificationLabel}</div>
                )}
                {entry && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {formatChangeRequestDate(entry.at)}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{changeRequest.description}</p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.85rem' }}>
          <span>
            <strong>{t('client.crDetail.projectLabel')}</strong> —{' '}
            {changeRequest.project ? changeRequest.project.name : t('client.crDetail.noProject')}
          </span>
          <span>
            <strong>{t('client.crDetail.priorityLabel')}</strong> — {t(PRIORITY_LABELS[changeRequest.priority])}
          </span>
          {changeRequest.pageUrl && (
            <span>
              <strong>{t('client.crDetail.pageLabel')}</strong> —{' '}
              <a className="portal-link" href={changeRequest.pageUrl} target="_blank" rel="noopener noreferrer">
                {changeRequest.pageUrl}
              </a>
            </span>
          )}
        </div>
        {(changeRequest.attachments ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {changeRequest.attachments!.map((file) => (
              <a
                key={file.filename}
                className="portal-link"
                href={clientFileUrl(file.filename)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {file.originalName}
              </a>
            ))}
          </div>
        )}
      </div>

      {changeRequest.linkedProposal && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <strong>
            {changeRequest.linkedProposal.status === 'SIGNED'
              ? t('client.crDetail.linkedQuoteSigned')
              : t('client.crDetail.linkedQuoteToSign')}
          </strong>
          <p style={{ margin: '8px 0' }}>{changeRequest.linkedProposal.title}</p>
          <Link
            className="portal-link"
            to={`/espace-client/projets/${changeRequest.linkedProposal.projectId}/propositions/${changeRequest.linkedProposal.proposalId}`}
          >
            {t('client.crDetail.viewQuote')}
          </Link>
        </div>
      )}

      {changeRequest.status === 'LIVREE' && (
        <div className="portal-card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <strong>{t('client.crDetail.deliveredTitle')}</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isAccountOwner && (
              <button
                type="button"
                className="portal-badge"
                disabled={busy}
                style={{ padding: '10px 18px' }}
                onClick={() => runAction(() => validateChangeRequest(id))}
              >
                {t('client.crDetail.validateDelivery')}
              </button>
            )}
            <button
              type="button"
              className="portal-badge"
              style={{ padding: '10px 18px' }}
              onClick={() => setShowCorrection((previous) => !previous)}
            >
              {t('client.crDetail.requestCorrection')}
            </button>
          </div>
          {showCorrection && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="correction-comment">{t('client.crDetail.correctionQuestion')}</label>
              <textarea
                id="correction-comment"
                className="portal-input"
                rows={3}
                value={correction}
                onChange={(event) => setCorrection(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !correction.trim()}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  runAction(() => requestChangeRequestCorrection(id, correction.trim())).then(() => {
                    setCorrection('')
                    setShowCorrection(false)
                  })
                }
              >
                {t('client.crDetail.sendCorrection')}
              </button>
            </div>
          )}
        </div>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>{t('client.crDetail.threadTitle')}</h2>
        <div className="portal-list">
          {changeRequest.replies.map((reply) => (
            <div key={reply._id} className="portal-card" style={{ display: 'flex', gap: 12 }}>
              <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={32} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {reply.authorName} · {formatChangeRequestDateTime(reply.createdAt)}
                </div>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                {(reply.attachments ?? []).map((file) => (
                  <a
                    key={file.filename}
                    className="portal-link"
                    href={clientFileUrl(file.filename)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.originalName}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleReply} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 720 }}>
          <label htmlFor="reply-message">{t('client.crDetail.writeMessage')}</label>
          <textarea
            id="reply-message"
            className="portal-input"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <input
            className="portal-input"
            type="file"
            multiple
            aria-label={t('client.crDetail.attachmentsAria')}
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          <button
            type="submit"
            className="portal-badge"
            disabled={busy}
            style={{ padding: '10px 18px', justifySelf: 'start' }}
          >
            {t('client.crDetail.send')}
          </button>
        </form>
      </section>
    </div>
  )
}

export default ClientChangeRequestDetail
