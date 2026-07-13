import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { ProjectCollaboratorRole, ProjectInvitation } from '../types/project.types'

interface ProjectInvitationsProps {
  projectId: string
  canManage: boolean
}

const roleLabels: Record<ProjectCollaboratorRole, string> = {
  VIEWER: 'Lecteur',
  EDITOR: 'Éditeur',
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function invitationStatus(invitation: ProjectInvitation): { label: string; key: string } {
  if (invitation.revokedAt) return { label: 'Révoquée', key: 'revoked' }
  if (invitation.usedAt) return { label: 'Utilisée', key: 'used' }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return { label: 'Expirée', key: 'expired' }
  return { label: 'Active', key: 'active' }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProjectInvitations({ projectId, canManage }: ProjectInvitationsProps) {
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
        if (!cancelled) setError(errorMessage(err, 'Impossible de charger les invitations'))
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
      setError(errorMessage(err, 'Impossible de créer le lien'))
    } finally {
      setSubmitting(false)
    }
  }

  const copyGeneratedUrl = async () => {
    if (!generatedUrl) return
    setCopyStatus('')
    try {
      await navigator.clipboard.writeText(generatedUrl)
      setCopyStatus('Lien copié. Il ne sera plus affiché après votre départ de cette page.')
    } catch {
      setCopyStatus('Copie impossible. Sélectionnez le lien puis copiez-le manuellement.')
    }
  }

  const revokeInvitation = async (invitation: ProjectInvitation) => {
    if (!window.confirm('Révoquer ce lien d’invitation ?')) return
    setError('')
    setPendingInvitationId(invitation._id)
    try {
      const data = await apiFetch<{ invitation: ProjectInvitation }>(
        `/api/projects/${projectId}/invitations/${invitation._id}`,
        { method: 'DELETE' },
      )
      setInvitations((current) => current.map((item) => (item._id === data.invitation._id ? data.invitation : item)))
    } catch (err: unknown) {
      setError(errorMessage(err, 'Impossible de révoquer ce lien'))
    } finally {
      setPendingInvitationId(null)
    }
  }

  return (
    <section className="client-collaborators" aria-labelledby="invitations-title">
      <div className="client-collaborators-header">
        <div>
          <h2 id="invitations-title">Liens d’invitation</h2>
          <p>Créez un lien à usage unique valable 7 jours. Son destinataire doit se connecter avec un compte client.</p>
        </div>
      </div>

      <form className="client-invitations-form" onSubmit={createInvitation}>
        <label>
          Rôle accordé
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ProjectCollaboratorRole)}
            disabled={submitting}
          >
            <option value="VIEWER">Lecteur</option>
            <option value="EDITOR">Éditeur</option>
          </select>
        </label>
        <button className="portal-button" type="submit" disabled={submitting}>
          {submitting ? 'Création…' : 'Générer un lien'}
        </button>
      </form>

      {generatedUrl && (
        <div className="client-invitation-generated" aria-live="polite">
          <label>
            Lien d’invitation généré
            <input
              aria-label="Lien d’invitation généré"
              value={generatedUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button type="button" className="portal-button" onClick={copyGeneratedUrl}>
            Copier le lien
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
        <p className="client-collaborators-status">Chargement des invitations…</p>
      ) : invitations.length === 0 ? (
        <p className="client-collaborators-status">Aucun lien d’invitation pour le moment.</p>
      ) : (
        <ul className="client-collaborators-list" aria-label="Invitations">
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation)
            const active = status.key === 'active'
            const pending = pendingInvitationId === invitation._id
            return (
              <li key={invitation._id} className="client-invitation-item">
                <div className="client-collaborator-identity">
                  <strong>{roleLabels[invitation.role]}</strong>
                  <span>
                    Créé le {formatDate(invitation.createdAt)} · expire le {formatDate(invitation.expiresAt)}
                  </span>
                  {invitation.usedBy && <span>Utilisé par {invitation.usedBy.name}</span>}
                </div>
                <span className={`client-invitation-status client-invitation-status--${status.key}`}>
                  {status.label}
                </span>
                {active && (
                  <button
                    type="button"
                    className="client-collaborators-revoke"
                    onClick={() => revokeInvitation(invitation)}
                    disabled={pending}
                  >
                    {pending ? 'Révocation…' : 'Révoquer'}
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
