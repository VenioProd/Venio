import PageHeader from '../../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Plus, Users } from 'lucide-react'
import { listDevProjects, type DevProject } from '../../../services/dev'
import { createCampaign, listCampaigns, type BetaCampaign, type BetaCampaignStatus } from '../../../services/beta'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import { formatRelative } from './helpers'
import './Beta.css'
import '../Production.css'

const STATUS_LABEL_KEY = {
  DRAFT: 'beta.admin.statusDraft',
  RUNNING: 'beta.admin.statusRunning',
  CLOSED: 'beta.admin.statusClosed',
} as const satisfies Record<BetaCampaignStatus, MessageKey>

const FILTERS: Array<{ id: 'all' | BetaCampaignStatus; labelKey: MessageKey }> = [
  { id: 'all', labelKey: 'beta.admin.filterAll' },
  { id: 'RUNNING', labelKey: 'beta.admin.filterRunning' },
  { id: 'DRAFT', labelKey: 'beta.admin.filterDraft' },
  { id: 'CLOSED', labelKey: 'beta.admin.filterClosed' },
]

export default function BetaWorkspace() {
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('beta.admin.loadFailed'))
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
    <div className="beta-workspace production-page production-list">
      <div className="production-header">
        <PageHeader
          eyebrow={t('shell.navItem.dev')}
          title={t('beta.admin.title')}
          actions={
            <button type="button" className="beta-btn beta-btn-primary" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> {t('beta.admin.newCampaign')}
            </button>
          }
        />
      </div>

      <nav className="beta-tabs" aria-label={t('beta.admin.filterAria')}>
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`beta-tab${filter === entry.id ? ' active' : ''}`}
            onClick={() => setFilter(entry.id)}
            aria-pressed={filter === entry.id}
          >
            {t(entry.labelKey)}
          </button>
        ))}
      </nav>

      {error && <p className="beta-error">{error}</p>}
      {loading && <p className="beta-muted">{t('beta.shared.loading')}</p>}

      {!loading && visible.length === 0 && (
        <div className="beta-empty">
          <p>
            {filter === 'all'
              ? t('beta.admin.emptyAll')
              : t('beta.admin.emptyFiltered', { status: t(STATUS_LABEL_KEY[filter]).toLowerCase() })}
          </p>
          <p className="beta-muted">{t('beta.admin.emptyHint')}</p>
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
                    {t(STATUS_LABEL_KEY[campaign.status])}
                  </span>
                  <h2>{campaign.name}</h2>
                  {campaign.description && <p className="beta-muted">{campaign.description}</p>}
                </div>
                <div className="beta-campaign-meta">
                  {project && <span className="beta-chip">{project.key}</span>}
                  <span className="beta-muted">
                    <Users size={12} aria-hidden /> {campaign.counts?.testers ?? 0}
                  </span>
                  <span className="beta-muted">
                    {t('beta.admin.scenarioCount', { count: campaign.counts?.scenarios ?? 0 })}
                  </span>
                  {(campaign.counts?.openFindings ?? 0) > 0 && (
                    <span className="beta-chip beta-chip-fail">
                      <AlertTriangle size={12} aria-hidden />{' '}
                      {t('beta.admin.openCount', { count: campaign.counts?.openFindings ?? 0 })}
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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : t('beta.admin.createFailed'))
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
        aria-label={t('beta.admin.createTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{t('beta.admin.createTitle')}</h2>
        <form onSubmit={submit}>
          <label>
            {t('beta.admin.devProject')}
            <select value={devProject} onChange={(event) => setDevProject(event.target.value)} required>
              <option value="">{t('beta.admin.choose')}</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.key} — {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('beta.admin.name')}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('beta.admin.namePlaceholder')}
              required
            />
          </label>
          <label>
            {t('beta.admin.targetUrl')}
            <input
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              placeholder={t('beta.admin.targetUrlPlaceholder')}
            />
          </label>
          <label>
            {t('beta.admin.testersShouldKnow')}
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label>
            {t('beta.admin.endsAt')}
            <input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
          <p className="beta-muted beta-hint">{t('beta.admin.endsAtHint')}</p>

          {error && <p className="beta-error">{error}</p>}
          <div className="beta-modal-actions">
            <button type="button" className="beta-btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="beta-btn beta-btn-primary" disabled={saving || !devProject || !name}>
              {saving ? t('beta.admin.creating') : t('beta.admin.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
