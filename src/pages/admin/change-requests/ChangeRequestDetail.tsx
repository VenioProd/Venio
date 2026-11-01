import PageHeader from '../../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { hasPermission } from '../../../lib/permissions'
import { apiFetch } from '../../../lib/api'
import UserAvatar from '../../../components/UserAvatar'
import {
  adminFileUrl,
  deliverChangeRequest,
  getAdminChangeRequest,
  qualifyInclude,
  qualifyQuote,
  refuseChangeRequest,
  replyAsAdmin,
  sendLinkedProposal,
  startChangeRequest,
} from '../../../services/changeRequests'
import type { AdminChangeRequest } from '../../../types/changeRequest.types'
import { ADMIN_PRIORITY_CONFIG, ADMIN_STATUS_CONFIG, formatAdminDate, formatAdminDateTime } from './types'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import '../Production.css'

interface ProjectOption {
  _id: string
  name: string
}

const AdminChangeRequestDetail = () => {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const { user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const canManage = hasPermission(user, 'manage_change_requests')
  const canBill = hasPermission(user, 'manage_billing')

  const [changeRequest, setChangeRequest] = useState<AdminChangeRequest | null>(null)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [quoteProjectId, setQuoteProjectId] = useState('')
  const [quoteExpiresAt, setQuoteExpiresAt] = useState('')
  const [showRefusal, setShowRefusal] = useState(false)
  const [refusalReason, setRefusalReason] = useState('')

  const load = useCallback(() => {
    getAdminChangeRequest(id)
      .then((data) => {
        setChangeRequest(data.changeRequest)
        setQuoteProjectId(data.changeRequest.project?._id || '')
      })
      .catch((err: Error) => setError(err.message || t('changeReq.detail.unavailable')))
  }, [id, t])

  useEffect(load, [load])

  const clientId = changeRequest?.client?._id
  // Liste des projets du compte, nécessaire quand la demande n'a pas de projet.
  useEffect(() => {
    if (!clientId) return
    // La route admin filtre par `clientId` (et non `client`).
    apiFetch<{ projects: ProjectOption[] }>(`/api/admin/projects?clientId=${clientId}`)
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [clientId])

  const run = async (action: () => Promise<{ changeRequest: AdminChangeRequest }>) => {
    setBusy(true)
    setError('')
    try {
      const result = await action()
      setChangeRequest(result.changeRequest)
      load()
    } catch (err) {
      setError((err as Error).message || t('changeReq.detail.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    await run(async () => {
      const result = await replyAsAdmin(id, message.trim(), files)
      setMessage('')
      setFiles([])
      return result
    })
  }

  const refusalBlock = (inputId: string) => (
    <div style={{ display: 'grid', gap: 8 }}>
      <label htmlFor={inputId}>{t('changeReq.detail.refusalReason')}</label>
      <textarea
        id={inputId}
        className="portal-input"
        rows={3}
        value={refusalReason}
        onChange={(event) => setRefusalReason(event.target.value)}
      />
      <button
        type="button"
        className="portal-badge"
        disabled={busy || !refusalReason.trim()}
        style={{ padding: '10px 18px', justifySelf: 'start' }}
        onClick={() =>
          run(async () => {
            const result = await refuseChangeRequest(id, refusalReason.trim())
            setShowRefusal(false)
            setRefusalReason('')
            return result
          })
        }
      >
        {t('changeReq.detail.refuseRequest')}
      </button>
    </div>
  )

  if (error && !changeRequest)
    return (
      <div className="portal-container production-page production-request-detail">
        <p role="alert">{error}</p>
      </div>
    )
  if (!changeRequest)
    return (
      <div className="portal-container production-page production-request-detail">
        <div className="portal-spinner" />
      </div>
    )

  const status = ADMIN_STATUS_CONFIG[changeRequest.status]
  const priorityConfig = ADMIN_PRIORITY_CONFIG[changeRequest.priority]

  return (
    <div className="portal-container production-page production-request-detail">
      {/* useConfirm renvoie un ÉLÉMENT JSX (ou null), pas un composant. */}
      {ConfirmDialog}
      <PageHeader
        eyebrow={t('changeReq.list.eyebrow')}
        title={changeRequest.title}
        subtitle={
          <>
            <span className="production-status" style={{ color: status.color }}>
              {t(status.labelKey)}
            </span>
            <span className="production-description">
              {t('changeReq.detail.meta', {
                client: changeRequest.client?.companyName || changeRequest.client?.name || '',
                project: changeRequest.project ? changeRequest.project.name : t('changeReq.list.noProject'),
                priority: priorityConfig ? t(priorityConfig.labelKey) : '',
                date: formatAdminDate(changeRequest.createdAt),
              })}
            </span>
          </>
        }
        actions={
          <Link to="/admin/demandes/clients" className="portal-button secondary">
            {t('changeReq.detail.back')}
          </Link>
        }
      />

      {error && <p role="alert">{error}</p>}

      <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{changeRequest.description}</p>
        {changeRequest.pageUrl && (
          <a className="portal-link" href={changeRequest.pageUrl} target="_blank" rel="noopener noreferrer">
            {changeRequest.pageUrl}
          </a>
        )}
        {(changeRequest.attachments ?? []).map((file) => (
          <a
            key={file.filename}
            className="portal-link"
            href={adminFileUrl(file.filename)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {file.originalName}
          </a>
        ))}
      </div>

      <ol className="portal-card" style={{ listStyle: 'none', display: 'grid', gap: 6, margin: '16px 0', padding: 20 }}>
        {changeRequest.statusHistory.map((entry, index) => (
          <li key={`${entry.status}-${index}`} style={{ fontSize: '0.8rem' }}>
            <strong>
              {ADMIN_STATUS_CONFIG[entry.status] ? t(ADMIN_STATUS_CONFIG[entry.status].labelKey) : entry.status}
            </strong>{' '}
            · {formatAdminDateTime(entry.at)} · {entry.byName}
            {entry.note ? ` — ${entry.note}` : ''}
          </li>
        ))}
      </ol>

      {changeRequest.status === 'SOUMISE' && canManage && (
        <div className="portal-card" style={{ display: 'grid', gap: 12 }}>
          <strong>{t('changeReq.detail.qualifyTitle')}</strong>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={async () => {
                const ok = await confirm({
                  title: t('changeReq.detail.includeConfirmTitle'),
                  message: t('changeReq.detail.includeConfirmMessage'),
                  confirmLabel: t('changeReq.detail.includeConfirmLabel'),
                  variant: 'info',
                })
                if (ok) run(() => qualifyInclude(id))
              }}
            >
              {t('changeReq.detail.includeInMaintenance')}
            </button>
            {canBill && (
              <button
                type="button"
                className="portal-badge"
                style={{ padding: '10px 18px' }}
                onClick={() => setShowQuoteForm((previous) => !previous)}
              >
                {t('changeReq.detail.toQuote')}
              </button>
            )}
            <button
              type="button"
              className="portal-badge"
              style={{ padding: '10px 18px' }}
              onClick={() => setShowRefusal((previous) => !previous)}
            >
              {t('changeReq.detail.refuseWithReason')}
            </button>
          </div>

          {showQuoteForm && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label htmlFor="quote-project">{t('changeReq.detail.quoteProject')}</label>
              <select
                id="quote-project"
                className="portal-input"
                value={quoteProjectId}
                onChange={(event) => setQuoteProjectId(event.target.value)}
              >
                <option value="">{t('changeReq.detail.selectProject')}</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <label htmlFor="quote-expires">{t('changeReq.detail.quoteExpires')}</label>
              <input
                id="quote-expires"
                className="portal-input"
                type="date"
                value={quoteExpiresAt}
                onChange={(event) => setQuoteExpiresAt(event.target.value)}
              />
              <button
                type="button"
                className="portal-badge"
                disabled={busy || !quoteProjectId}
                style={{ padding: '10px 18px', justifySelf: 'start' }}
                onClick={() =>
                  run(async () => {
                    const result = await qualifyQuote(id, {
                      projectId: quoteProjectId,
                      expiresAt: quoteExpiresAt ? new Date(quoteExpiresAt).toISOString() : undefined,
                    })
                    setShowQuoteForm(false)
                    return result
                  })
                }
              >
                {t('changeReq.detail.createPrefilledQuote')}
              </button>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>
                {t('changeReq.detail.quoteSignedHint')}
              </p>
            </div>
          )}

          {showRefusal && refusalBlock('refusal-reason')}
        </div>
      )}

      {changeRequest.status === 'A_CHIFFRER' && canManage && (
        <div className="portal-card" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <strong>
            {t('changeReq.detail.linkedQuoteTitle', {
              status: changeRequest.quoteProposal?.status ?? t('changeReq.detail.quoteUnknown'),
            })}
          </strong>
          {changeRequest.project && (
            <Link className="portal-link" to={`/admin/projets/${changeRequest.project._id}`}>
              {t('changeReq.detail.openProject', { name: changeRequest.project.name })}
            </Link>
          )}
          {canBill && changeRequest.quoteProposal?.status === 'DRAFT' && (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px', justifySelf: 'start' }}
              onClick={async () => {
                setBusy(true)
                try {
                  await sendLinkedProposal(changeRequest.quoteProposal!._id)
                  load()
                } catch (err) {
                  setError((err as Error).message || t('changeReq.detail.sendFailed'))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('changeReq.detail.sendToClient')}
            </button>
          )}
          <button
            type="button"
            className="portal-badge"
            style={{ padding: '10px 18px', justifySelf: 'start' }}
            onClick={() => setShowRefusal((previous) => !previous)}
          >
            {t('changeReq.detail.refuseQuote')}
          </button>
          {showRefusal && refusalBlock('refusal-reason-quote')}
        </div>
      )}

      {canManage && (changeRequest.status === 'PLANIFIEE' || changeRequest.status === 'EN_COURS') && (
        <div className="portal-card" style={{ marginTop: 16 }}>
          {changeRequest.status === 'PLANIFIEE' ? (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={() => run(() => startChangeRequest(id))}
            >
              {t('changeReq.detail.start')}
            </button>
          ) : (
            <button
              type="button"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px' }}
              onClick={() => run(() => deliverChangeRequest(id))}
            >
              {t('changeReq.detail.markDelivered')}
            </button>
          )}
        </div>
      )}

      {changeRequest.status === 'LIVREE' && (
        <p className="portal-card" role="status" style={{ marginTop: 16 }}>
          {t('changeReq.detail.awaitingClient')}
        </p>
      )}

      <section style={{ marginTop: 32 }}>
        <h2>{t('changeReq.detail.threadTitle')}</h2>
        <div className="portal-list">
          {changeRequest.replies.map((reply) => (
            <div key={reply._id} className="portal-card" style={{ display: 'flex', gap: 12 }}>
              <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={32} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {reply.authorName} · {formatAdminDateTime(reply.createdAt)}
                </div>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{reply.message}</p>
                {(reply.attachments ?? []).map((file) => (
                  <a
                    key={file.filename}
                    className="portal-link"
                    href={adminFileUrl(file.filename)}
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

        {canManage && (
          <form onSubmit={handleReply} style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 720 }}>
            <label htmlFor="admin-reply">{t('changeReq.detail.replyLabel')}</label>
            <textarea
              id="admin-reply"
              className="portal-input"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <input
              className="portal-input"
              type="file"
              multiple
              aria-label={t('changeReq.detail.replyAttachments')}
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
            />
            <button
              type="submit"
              className="portal-badge"
              disabled={busy}
              style={{ padding: '10px 18px', justifySelf: 'start' }}
            >
              {t('changeReq.detail.send')}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

export default AdminChangeRequestDetail
