import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FlaskConical, Plus, Users } from 'lucide-react'
import { listDevProjects, type DevProject } from '../../../services/dev'
import { createCampaign, listCampaigns, type BetaCampaign, type BetaCampaignStatus } from '../../../services/beta'
import { formatRelative } from './helpers'
import './Beta.css'

const STATUS_LABEL: Record<BetaCampaignStatus, string> = {
  DRAFT: 'Brouillon',
  RUNNING: 'En cours',
  CLOSED: 'Close',
}

const FILTERS: Array<{ id: 'all' | BetaCampaignStatus; label: string }> = [
  { id: 'all', label: 'Toutes' },
  { id: 'RUNNING', label: 'En cours' },
  { id: 'DRAFT', label: 'Brouillons' },
  { id: 'CLOSED', label: 'Closes' },
]

export default function BetaWorkspace() {
  const [campaigns, setCampaigns] = useState<BetaCampaign[]>([])
  const [projects, setProjects] = useState<DevProject[]>([])
  const [filter, setFilter] = useState<'all' | BetaCampaignStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [campaignsResult, projectsResult] = await Promise.all([listCampaigns(), listDevProjects()])
      setCampaigns(campaignsResult.campaigns)
      setProjects(projectsResult.projects ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => (filter === 'all' ? campaigns : campaigns.filter((campaign) => campaign.status === filter)),
    [campaigns, filter],
  )

  return (
    <div className="beta-workspace">
      <header className="beta-header">
        <div className="beta-header-title">
          <FlaskConical size={18} aria-hidden />
          <h1>Beta tests</h1>
        </div>
        <button type="button" className="beta-btn beta-btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden /> Nouvelle campagne
        </button>
      </header>

      <nav className="beta-tabs" aria-label="Filtrer les campagnes">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`beta-tab${filter === entry.id ? ' active' : ''}`}
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <p className="beta-error">{error}</p>}
      {loading && <p className="beta-muted">Chargement…</p>}

      {!loading && visible.length === 0 && (
        <div className="beta-empty">
          <p>Aucune campagne {filter === 'all' ? '' : STATUS_LABEL[filter as BetaCampaignStatus].toLowerCase()}.</p>
          <p className="beta-muted">
            Une campagne regroupe les démarches à tester, les testeurs invités et leurs retours.
          </p>
        </div>
      )}

      <ul className="beta-campaign-list">
        {visible.map((campaign) => {
          const project = typeof campaign.devProject === 'object' ? campaign.devProject : null
          return (
            <li key={campaign._id}>
              <Link to={`/admin/beta/campaigns/${campaign._id}`} className="beta-campaign-card">
                <div className="beta-campaign-main">
                  <span className={`beta-status beta-status-${campaign.status.toLowerCase()}`}>
                    {STATUS_LABEL[campaign.status]}
                  </span>
                  <h2>{campaign.name}</h2>
                  {campaign.description && <p className="beta-muted">{campaign.description}</p>}
                </div>
                <div className="beta-campaign-meta">
                  {project && <span className="beta-chip">{project.key}</span>}
                  <span className="beta-muted">
                    <Users size={12} aria-hidden /> {campaign.counts?.testers ?? 0}
                  </span>
                  <span className="beta-muted">{campaign.counts?.scenarios ?? 0} démarche(s)</span>
                  {(campaign.counts?.openFindings ?? 0) > 0 && (
                    <span className="beta-chip beta-chip-fail">
                      <AlertTriangle size={12} aria-hidden /> {campaign.counts?.openFindings} à traiter
                    </span>
                  )}
                  <span className="beta-muted">{formatRelative(campaign.updatedAt)}</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      {creating && (
        <CampaignCreateModal
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={(campaign) => {
            setCampaigns((current) => [campaign, ...current])
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

interface ModalProps {
  projects: DevProject[]
  onClose: () => void
  onCreated: (campaign: BetaCampaign) => void
}

function CampaignCreateModal({ projects, onClose, onCreated }: ModalProps) {
  const [name, setName] = useState('')
  const [devProject, setDevProject] = useState(projects[0]?._id ?? '')
  const [targetUrl, setTargetUrl] = useState('')
  const [description, setDescription] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { campaign } = await createCampaign({
        devProject,
        name,
        description,
        targetUrl: targetUrl || undefined,
        endsAt: endsAt || undefined,
      })
      onCreated(campaign)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="beta-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="beta-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nouvelle campagne"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Nouvelle campagne</h2>
        <form onSubmit={submit}>
          <label>
            Projet dev
            <select value={devProject} onChange={(event) => setDevProject(event.target.value)} required>
              <option value="">Choisir…</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.key} — {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nom
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Recette du site vitrine"
              required
            />
          </label>
          <label>
            URL à tester
            <input
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder="https://exemple.fr"
            />
          </label>
          <label>
            Ce que les testeurs doivent savoir
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label>
            Fin de campagne
            <input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
          <p className="beta-muted beta-hint">À la date de fin, les liens des testeurs cessent de fonctionner.</p>

          {error && <p className="beta-error">{error}</p>}
          <div className="beta-modal-actions">
            <button type="button" className="beta-btn" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="beta-btn beta-btn-primary" disabled={saving || !devProject || !name}>
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
