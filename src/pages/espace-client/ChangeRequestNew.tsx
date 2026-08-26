import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { createChangeRequest } from '../../services/changeRequests'
import type { ChangeRequestPriority } from '../../types/changeRequest.types'
import './ClientPortal.css'

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 50

interface ProjectOption {
  _id: string
  name: string
}

const ChangeRequestNew = () => {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<ChangeRequestPriority>('NORMALE')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiFetch<{ projects: ProjectOption[] }>('/api/projects')
      .then((data) => setProjects(data.projects || []))
      .catch(() => setProjects([]))
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!title.trim()) return setError('Un titre est nécessaire pour identifier votre demande.')
    if (!description.trim()) return setError('Décrivez votre demande pour que nous puissions la qualifier.')
    if (files.length > MAX_FILES) return setError(`${MAX_FILES} fichiers au maximum.`)

    setSubmitting(true)
    try {
      const { changeRequest } = await createChangeRequest({
        title: title.trim(),
        description: description.trim(),
        pageUrl: pageUrl.trim(),
        projectId: projectId || undefined,
        priority,
        files,
      })
      navigate(`/espace-client/demandes/${changeRequest._id}`)
    } catch (err) {
      setError((err as Error).message || 'Envoi impossible')
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-container">
      <Link to="/espace-client/demandes" className="portal-link">
        ← Vos demandes
      </Link>
      <h1 style={{ marginTop: 16 }}>Nouvelle demande</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 640 }}>
        Une retouche, une évolution ? Décrivez-la : nous la qualifions et vous indiquons si elle entre dans votre
        contrat de maintenance ou si elle fait l’objet d’un devis.
      </p>

      {error && (
        <p role="alert" style={{ color: 'var(--mono-danger, #ff5c5c)' }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="portal-card" style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>Titre de la demande *</span>
          <input
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex. Corriger le formulaire de contact"
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Décrivez votre demande *</span>
          <textarea
            className="portal-input"
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ce que vous souhaitez obtenir, et pourquoi."
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Page concernée</span>
          <input
            className="portal-input"
            type="url"
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder="https://votre-site.fr/la-page"
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Projet</span>
          <select className="portal-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Aucun projet / site en maintenance</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>Priorité</span>
          <select
            className="portal-input"
            value={priority}
            onChange={(event) => setPriority(event.target.value as ChangeRequestPriority)}
          >
            <option value="BASSE">Basse</option>
            <option value="NORMALE">Normale</option>
            <option value="HAUTE">Haute</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>
            Pièces jointes — {MAX_FILES} fichiers max, {MAX_FILE_SIZE_MB} Mo chacun
          </span>
          <input
            className="portal-input"
            type="file"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []))}
          />
          {files.length > 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {files.map((file) => file.name).join(' · ')}
            </span>
          )}
        </label>

        <button type="submit" className="portal-badge" disabled={submitting} style={{ padding: '12px 20px' }}>
          {submitting ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>
    </div>
  )
}

export default ChangeRequestNew
