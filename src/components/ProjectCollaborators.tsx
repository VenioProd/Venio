import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../context/I18nContext'
import { translate, type MessageKey } from '../i18n'
import type { ProjectCollaborator, ProjectCollaboratorRole } from '../types/project.types'

interface ProjectCollaboratorsProps {
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

export default function ProjectCollaborators({ projectId, canManage }: ProjectCollaboratorsProps) {
  const { t } = useI18n()
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([])
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<ProjectCollaboratorRole>('VIEWER')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canManage) return
    let cancelled = false

    apiFetch<{ collaborators: ProjectCollaborator[] }>(`/api/projects/${projectId}/collaborators`)
      .then((data) => {
        if (!cancelled) setCollaborators(data.collaborators || [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, translate('shared.collaborators.loadError')))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canManage, projectId])

  if (!canManage) return null

  const addCollaborator = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const data = await apiFetch<{ collaborator: ProjectCollaborator }>(`/api/projects/${projectId}/collaborators`, {
        method: 'POST',
        body: JSON.stringify({ email, role: newRole }),
      })
      setCollaborators((current) => [...current, data.collaborator])
      setEmail('')
      setNewRole('VIEWER')
    } catch (err: unknown) {
      setError(errorMessage(err, t('shared.collaborators.addError')))
    } finally {
      setSubmitting(false)
    }
  }

  const updateRole = async (collaborator: ProjectCollaborator, role: ProjectCollaboratorRole) => {
    if (role === collaborator.role) return
    setError('')
    setPendingMemberId(collaborator._id)
    try {
      const data = await apiFetch<{ collaborator: ProjectCollaborator }>(
        `/api/projects/${projectId}/collaborators/${collaborator._id}`,
        { method: 'PATCH', body: JSON.stringify({ role }) },
      )
      setCollaborators((current) =>
        current.map((item) => (item._id === data.collaborator._id ? data.collaborator : item)),
      )
    } catch (err: unknown) {
      setError(errorMessage(err, t('shared.collaborators.roleError')))
    } finally {
      setPendingMemberId(null)
    }
  }

  const revoke = async (collaborator: ProjectCollaborator) => {
    if (!window.confirm(t('shared.collaborators.revokeConfirm', { name: collaborator.user.name }))) return
    setError('')
    setPendingMemberId(collaborator._id)
    try {
      await apiFetch(`/api/projects/${projectId}/collaborators/${collaborator._id}`, { method: 'DELETE' })
      setCollaborators((current) => current.filter((item) => item._id !== collaborator._id))
    } catch (err: unknown) {
      setError(errorMessage(err, t('shared.collaborators.revokeError')))
    } finally {
      setPendingMemberId(null)
    }
  }

  return (
    <section className="client-collaborators" aria-labelledby="collaborators-title">
      <div className="client-collaborators-header">
        <div>
          <h2 id="collaborators-title">{t('shared.collaborators.title')}</h2>
          <p>{t('shared.collaborators.intro')}</p>
        </div>
      </div>

      <form className="client-collaborators-form" onSubmit={addCollaborator}>
        <label>
          {t('shared.collaborators.emailLabel')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('shared.collaborators.emailPlaceholder')}
            autoComplete="email"
            required
            disabled={submitting}
          />
        </label>
        <label>
          {t('shared.collaborators.roleLabel')}
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as ProjectCollaboratorRole)}
            disabled={submitting}
          >
            <option value="VIEWER">{t('shared.projectRole.viewer')}</option>
            <option value="EDITOR">{t('shared.projectRole.editor')}</option>
          </select>
        </label>
        <button className="portal-button" type="submit" disabled={submitting}>
          {submitting ? t('shared.collaborators.adding') : t('shared.collaborators.add')}
        </button>
      </form>

      {error && (
        <p className="client-collaborators-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="client-collaborators-status">{t('shared.collaborators.loading')}</p>
      ) : collaborators.length === 0 ? (
        <p className="client-collaborators-status">{t('shared.collaborators.empty')}</p>
      ) : (
        <ul className="client-collaborators-list">
          {collaborators.map((collaborator) => {
            const pending = pendingMemberId === collaborator._id
            return (
              <li key={collaborator._id} className="client-collaborators-item">
                <div className="client-collaborator-identity">
                  <strong>{collaborator.user.name}</strong>
                  <span>{collaborator.user.email}</span>
                </div>
                <label className="client-collaborator-role">
                  <span className="sr-only">{t('shared.collaborators.roleOf', { name: collaborator.user.name })}</span>
                  <select
                    aria-label={t('shared.collaborators.roleOf', { name: collaborator.user.name })}
                    value={collaborator.role}
                    onChange={(event) => updateRole(collaborator, event.target.value as ProjectCollaboratorRole)}
                    disabled={pending}
                  >
                    {Object.entries(ROLE_LABEL_KEYS).map(([role, labelKey]) => (
                      <option key={role} value={role}>
                        {t(labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="client-collaborators-revoke"
                  onClick={() => revoke(collaborator)}
                  disabled={pending}
                >
                  {pending ? t('shared.collaborators.updating') : t('shared.collaborators.revoke')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
