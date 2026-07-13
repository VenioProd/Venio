import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { ProjectCollaborator, ProjectCollaboratorRole } from '../types/project.types'

interface ProjectCollaboratorsProps {
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

export default function ProjectCollaborators({ projectId, canManage }: ProjectCollaboratorsProps) {
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
        if (!cancelled) setError(errorMessage(err, 'Impossible de charger les collaborateurs'))
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
      setError(errorMessage(err, 'Impossible d’ajouter ce collaborateur'))
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
      setError(errorMessage(err, 'Impossible de modifier ce rôle'))
    } finally {
      setPendingMemberId(null)
    }
  }

  const revoke = async (collaborator: ProjectCollaborator) => {
    if (!window.confirm(`Révoquer l’accès de ${collaborator.user.name} ?`)) return
    setError('')
    setPendingMemberId(collaborator._id)
    try {
      await apiFetch(`/api/projects/${projectId}/collaborators/${collaborator._id}`, { method: 'DELETE' })
      setCollaborators((current) => current.filter((item) => item._id !== collaborator._id))
    } catch (err: unknown) {
      setError(errorMessage(err, 'Impossible de révoquer cet accès'))
    } finally {
      setPendingMemberId(null)
    }
  }

  return (
    <section className="client-collaborators" aria-labelledby="collaborators-title">
      <div className="client-collaborators-header">
        <div>
          <h2 id="collaborators-title">Collaborateurs</h2>
          <p>Ajoutez un client par son adresse e-mail exacte et définissez son accès au projet.</p>
        </div>
      </div>

      <form className="client-collaborators-form" onSubmit={addCollaborator}>
        <label>
          Adresse e-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@exemple.fr"
            autoComplete="email"
            required
            disabled={submitting}
          />
        </label>
        <label>
          Rôle
          <select
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as ProjectCollaboratorRole)}
            disabled={submitting}
          >
            <option value="VIEWER">Lecteur</option>
            <option value="EDITOR">Éditeur</option>
          </select>
        </label>
        <button className="portal-button" type="submit" disabled={submitting}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>

      {error && (
        <p className="client-collaborators-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="client-collaborators-status">Chargement des collaborateurs…</p>
      ) : collaborators.length === 0 ? (
        <p className="client-collaborators-status">Aucun collaborateur pour le moment.</p>
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
                  <span className="sr-only">Rôle de {collaborator.user.name}</span>
                  <select
                    aria-label={`Rôle de ${collaborator.user.name}`}
                    value={collaborator.role}
                    onChange={(event) => updateRole(collaborator, event.target.value as ProjectCollaboratorRole)}
                    disabled={pending}
                  >
                    {Object.entries(roleLabels).map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
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
                  {pending ? 'Mise à jour…' : 'Révoquer'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
