import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { listClientDocuments } from '../../services/clientVault'
import { SkeletonGrid } from '../../components/Skeleton'
import type { ClientVaultDocument } from '../../types/clientVault.types'
import type { Project } from '../../types/project.types'
import './ClientPortal.css'

const TYPE_LABELS: Record<string, string> = {
  DEVIS: 'Devis',
  FACTURE: 'Factures',
  CONTRAT: 'Contrats',
  LIVRABLE: 'Livrables',
  FICHIER_PROJET: 'Fichiers projet',
}

function formatSize(size: number | null): string {
  if (size === null) return '—'
  if (size < 1024) return `${size} o`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`
}

const ClientDocuments = () => {
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
        setError((err as Error).message || 'Erreur chargement documents')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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
      <h1>Mes documents</h1>

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
              placeholder="Rechercher un document..."
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
              <option value="ALL">Tous les types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="portal-input"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ flex: '0 0 auto', width: 'auto', minWidth: '160px' }}
            >
              <option value="ALL">Tous les projets</option>
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
              <h3>Aucun document pour le moment</h3>
              <p>Vos devis, factures, contrats et livrables apparaîtront ici.</p>
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
                    <span className="portal-badge">{TYPE_LABELS[doc.type] || doc.type}</span>
                    <h3 style={{ margin: '8px 0 4px' }}>{doc.title}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                      <Link to={`/espace-client/projets/${doc.project.id}`} className="portal-link">
                        {doc.project.name}
                      </Link>
                      {' · '}
                      {new Date(doc.date).toLocaleDateString('fr-FR')}
                      {' · '}
                      {formatSize(doc.size)}
                    </p>
                  </div>
                  <a className="portal-button" href={doc.downloadUrl}>
                    Télécharger
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
