import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
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
  const { t } = useI18n()
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
    if (!title.trim()) return setError(t('client.crNew.titleRequired'))
    if (!description.trim()) return setError(t('client.crNew.descriptionRequired'))
    if (files.length > MAX_FILES) return setError(t('client.crNew.maxFiles', { count: MAX_FILES }))

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
      setError((err as Error).message || t('client.crNew.sendError'))
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-container">
      <Link to="/espace-client/demandes" className="portal-link">
        {t('client.crNew.backToList')}
      </Link>
      <h1 style={{ marginTop: 16 }}>{t('client.crNew.heading')}</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 640 }}>{t('client.crNew.intro')}</p>

      {error && (
        <p role="alert" style={{ color: 'var(--mono-danger, #ff5c5c)' }}>
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="portal-card" style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.titleLabel')}</span>
          <input
            className="portal-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('client.crNew.titlePlaceholder')}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.descriptionLabel')}</span>
          <textarea
            className="portal-input"
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('client.crNew.descriptionPlaceholder')}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.pageLabel')}</span>
          <input
            className="portal-input"
            type="url"
            value={pageUrl}
            onChange={(event) => setPageUrl(event.target.value)}
            placeholder={t('client.crNew.pagePlaceholder')}
          />
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.projectLabel')}</span>
          <select className="portal-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{t('client.crNew.noProject')}</option>
            {projects.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.priorityLabel')}</span>
          <select
            className="portal-input"
            value={priority}
            onChange={(event) => setPriority(event.target.value as ChangeRequestPriority)}
          >
            <option value="BASSE">{t('client.crPriority.low')}</option>
            <option value="NORMALE">{t('client.crPriority.normal')}</option>
            <option value="HAUTE">{t('client.crPriority.high')}</option>
          </select>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span>{t('client.crNew.attachments', { maxFiles: MAX_FILES, maxSize: MAX_FILE_SIZE_MB })}</span>
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
          {submitting ? t('client.crNew.sending') : t('client.crNew.submit')}
        </button>
      </form>
    </div>
  )
}

export default ChangeRequestNew
