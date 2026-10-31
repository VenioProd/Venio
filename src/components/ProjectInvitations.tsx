import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../context/I18nContext'
import { translate, type MessageKey } from '../i18n'
import { formatDateTime } from '../i18n/format'
import type { ProjectCollaboratorRole, ProjectInvitation } from '../types/project.types'

interface ProjectInvitationsProps {
  projectId: string
  canManage: boolean
}

const ROLE_LABEL_KEYS = {
  VIEWER: 'shared.projectRole.viewer',
  EDITOR: 'shared.projectRole.editor',
} as const satisfies Record<ProjectCollaboratorRole, MessageKey>

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function invitationStatus(invitation: ProjectInvitation): { labelKey: MessageKey; key: string } {
  if (invitation.revokedAt) return { labelKey: 'shared.invitations.statusRevoked', key: 'revoked' }
  if (invitation.usedAt) return { labelKey: 'shared.invitations.statusUsed', key: 'used' }
  if (new Date(invitation.expiresAt).getTime() <= Date.now())
    return { labelKey: 'shared.invitations.statusExpired', key: 'expired' }
  return { labelKey: 'shared.invitations.statusActive', key: 'active' }
}

function formatDate(value: string): string {
  return formatDateTime(value, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProjectInvitations({ projectId, canManage }: ProjectInvitationsProps) {
  const { t } = useI18n()
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([])
  const [role, setRole] = useState<ProjectCollaboratorRole>('VIEWER')
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')

  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    apiFetch<{ invitations: ProjectInvitation[] }>(`/api/projects/${projectId}/invitations`)
      .then((data) => {
        if (!cancelled) setInvitations(data.invitations || [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, translate('shared.invitations.loadError')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, projectId])

  if (!canManage) return null

  const createInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setCopyStatus('')
    setSubmitting(true)
    try {
      const data = await apiFetch<{ invitation: ProjectInvitation; invitationUrl: string }>(
        `/api/projects/${projectId}/invitations`,
        { method: 'POST', body: JSON.stringify({ role }) },
      )
      setInvitations((current) => [data.invitation, ...current])
      // This is the sole frontend state that contains the raw bearer link.
      // It is intentionally never persisted or included in the invitation list.
      setGeneratedUrl(data.invitationUrl)
      setRole('VIEWER')
    } catch (err: unknown) {
      setError(errorMessage(err, t('shared.invitations.createError')))
    } finally {
      setSubmitting(false)
    }
  }

  const copyGeneratedUrl = async () => {
    if (!generatedUrl) return
    setCopyStatus('')
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopyStatus(t('shared.invitations.copied'))
    } catch {
      setCopyStatus(t('shared.invitations.copyFailed'))
    }
  }

  const revokeInvitation = async (invitation: ProjectInvitation) => {
    if (!window.confirm(t('shared.invitations.revokeConfirm'))) return
    setError('')
    setPendingInvitationId(invitation._id)
    try {
      const data = await apiFetch<{ invitation: ProjectInvitation }>(
        `/api/projects/${projectId}/invitations/${invitation._id}`,
        { method: 'DELETE' },
      )
      setInvitations((current) => current.map((item) => (item._id === data.invitation._id ? data.invitation : item)))
    } catch (err: unknown) {
      setError(errorMessage(err, t('shared.invitations.revokeError')))
    } finally {
      setPendingInvitationId(null)
    }
  }

  return (
    <section className="client-collaborators" aria-labelledby="invitations-title">
      <div className="client-collaborators-header">
        <div>
          <h2 id="invitations-title">{t('shared.invitations.title')}</h2>
          <p>{t('shared.invitations.intro')}</p>
        </div>
      </div>

      <form className="client-invitations-form" onSubmit={createInvitation}>
        <label>
          {t('shared.invitations.roleLabel')}
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ProjectCollaboratorRole)}
            disabled={submitting}
          >
            <option value="VIEWER">{t('shared.projectRole.viewer')}</option>
            <option value="EDITOR">{t('shared.projectRole.editor')}</option>
          </select>
        </label>
        <button className="portal-button" type="submit" disabled={submitting}>
          {submitting ? t('shared.invitations.creating') : t('shared.invitations.generate')}
        </button>
      </form>

      {generatedUrl && (
        <div className="client-invitation-generated" aria-live="polite">
          <label>
            {t('shared.invitations.generatedLabel')}
            <input
              aria-label={t('shared.invitations.generatedLabel')}
              value={generatedUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button type="button" className="portal-button" onClick={copyGeneratedUrl}>
            {t('shared.invitations.copyLink')}
          </button>
          {copyStatus && <p className="client-collaborators-status">{copyStatus}</p>}
        </div>
      )}

      {error && (
        <p className="client-collaborators-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="client-collaborators-status">{t('shared.invitations.loading')}</p>
      ) : invitations.length === 0 ? (
        <p className="client-collaborators-status">{t('shared.invitations.empty')}</p>
      ) : (
        <ul className="client-collaborators-list" aria-label={t('shared.invitations.listLabel')}>
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation)
            const active = status.key === 'active'
            const pending = pendingInvitationId === invitation._id
            return (
              <li key={invitation._id} className="client-invitation-item">
                <div className="client-collaborator-identity">
                  <strong>{t(ROLE_LABEL_KEYS[invitation.role])}</strong>
                  <span>
                    {t('shared.invitations.createdExpires', {
                      created: formatDate(invitation.createdAt),
                      expires: formatDate(invitation.expiresAt),
                    })}
                  </span>
                  {invitation.usedBy && <span>{t('shared.invitations.usedBy', { name: invitation.usedBy.name })}</span>}
                </div>
                <span className={`client-invitation-status client-invitation-status--${status.key}`}>
                  {t(status.labelKey)}
                </span>
                {active && (
                  <button
                    type="button"
                    className="client-collaborators-revoke"
                    onClick={() => revokeInvitation(invitation)}
                    disabled={pending}
                  >
                    {pending ? t('shared.invitations.revoking') : t('shared.invitations.revoke')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
