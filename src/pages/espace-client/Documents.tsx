import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { translate, type MessageKey } from '../../i18n'
import { formatDate } from '../../i18n/format'
import { apiFetch } from '../../lib/api'
import { listClientDocuments } from '../../services/clientVault'
import { SkeletonGrid } from '../../components/Skeleton'
import type { ClientVaultDocument } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  DEVIS: 'client.documents.typeQuote',
  FACTURE: 'client.documents.typeInvoice',
  CONTRAT: 'client.documents.typeContract',
  LIVRABLE: 'client.documents.typeDeliverable',
  FICHIER_PROJET: 'client.documents.typeProjectFile',
}

function formatSize(size: number | null): string {
  if (size === null) return '—'
  if (size < 1024) return translate('client.documents.sizeBytes', { value: size })
  if (size < 1024 * 1024) return translate('client.documents.sizeKb', { value: (size / 1024).toFixed(1) })
  return translate('client.documents.sizeMb', { value: (size / (1024 * 1024)).toFixed(1) })
}

const ClientDocuments = () => {
  const { t } = useI18n()
  const [documents, setDocuments] = useState<ClientVaultDocument[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [projectFilter, setProjectFilter] = useState('ALL')

  useEffect(() => {
    const load = async () => {
      try {
        const [documentsData, projectsData] = await Promise.all([
          listClientDocuments(),
          apiFetch<{ projects: Project[] }>('/api/projects'),
        ])
        setDocuments(documentsData.documents)
        setProjects(projectsData.projects || [])
      } catch (err: unknown) {
        setError((err as Error).message || t('client.documents.loadError'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  const filtered = useMemo(() => {
    let result = [...documents]
    if (typeFilter !== 'ALL') result = result.filter((d) => d.type === typeFilter)
    if (projectFilter !== 'ALL') result = result.filter((d) => d.project.id === projectFilter)
    if (search.trim()) {
      const needle = search.toLowerCase()
      result = result.filter((d) => d.title.toLowerCase().includes(needle))
    }
    return result
  }, [documents, typeFilter, projectFilter, search])

  return (
    <div className="portal-container">
      <h1>{t('client.documents.title')}</h1>

      {loading && <SkeletonGrid count={4} className="client-dashboard-grid" />}

      {error && (
        <div className="client-dashboard-error">
          <span className="client-dashboard-error-icon">!</span>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <input
              className="portal-input"
              type="text"
              placeholder={t('client.documents.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 200px', minWidth: '200px' }}
            />
            <select
              className="portal-input"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ flex: '0 0 auto', width: 'auto', minWidth: '160px' }}
            >
              <option value="ALL">{t('client.documents.allTypes')}</option>
              {Object.entries(TYPE_LABEL_KEYS).map(([value, labelKey]) => (
                <option key={value} value={value}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
            <select
              className="portal-input"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ flex: '0 0 auto', width: 'auto', minWidth: '160px' }}
            >
              <option value="ALL">{t('client.documents.allProjects')}</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="client-dashboard-empty">
              <div className="client-dashboard-empty-icon">📄</div>
              <h3>{t('client.documents.emptyTitle')}</h3>
              <p>{t('client.documents.emptyBody')}</p>
            </div>
          ) : (
            <div className="portal-list">
              {filtered.map((doc) => (
                <div
                  key={`${doc.source}-${doc.id}`}
                  className="portal-card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                >
                  <div>
                    <span className="portal-badge">
                      {TYPE_LABEL_KEYS[doc.type] ? t(TYPE_LABEL_KEYS[doc.type]) : doc.type}
                    </span>
                    <h3 style={{ margin: '8px 0 4px' }}>{doc.title}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <Link to={`/espace-client/projets/${doc.project.id}`} className="portal-link">
                        {doc.project.name}
                      </Link>
                      {' · '}
                      {formatDate(doc.date)}
                      {' · '}
                      {formatSize(doc.size)}
                    </p>
                  </div>
                  <a className="portal-button" href={doc.downloadUrl}>
                    {t('client.billing.download')}
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ClientDocuments
