import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Play, Square } from 'lucide-react'
import {
  campaignReportUrl,
  getCampaign,
  listRuns,
  updateCampaign,
  type BetaRun,
  type CampaignDetail,
} from '../../../services/beta'
import CoverageGrid from './CoverageGrid'
import FindingsQueue from './FindingsQueue'
import ScenarioPanel from './ScenarioPanel'
import TesterPanel from './TesterPanel'
import './Beta.css'

type Tab = 'coverage' | 'findings' | 'scenarios' | 'testers'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'coverage', label: 'Couverture' },
  { id: 'findings', label: 'Retours' },
  { id: 'scenarios', label: 'Démarches' },
  { id: 'testers', label: 'Testeurs' },
]

export default function CampaignCockpit() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [runs, setRuns] = useState<BetaRun[]>([])
  const [tab, setTab] = useState<Tab>('coverage')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError(null)
    try {
      const [detailResult, runsResult] = await Promise.all([getCampaign(campaignId), listRuns(campaignId)])
      setDetail(detailResult)
      setRuns(runsResult.runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStatus() {
    if (!detail) return
    const next = detail.campaign.status === 'RUNNING' ? 'CLOSED' : 'RUNNING'
    const { campaign } = await updateCampaign(detail.campaign._id, { status: next })
    setDetail({ ...detail, campaign })
  }

  if (loading) return <p className="beta-muted beta-workspace">Chargement…</p>
  if (error) return <p className="beta-error beta-workspace">{error}</p>
  if (!detail) return null

  const { campaign, scenarios, testers, coverage } = detail
  const openFindings = runs.filter(
    (run) => run.verdict !== 'WORKS' && (run.status === 'OPEN' || run.status === 'ACKNOWLEDGED'),
  ).length

  return (
    <div className="beta-workspace">
      <header className="beta-header">
        <div className="beta-header-title">
          <Link to="/admin/beta" className="beta-back" aria-label="Retour aux campagnes">
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <div>
            <h1>{campaign.name}</h1>
            {campaign.targetUrl && (
              <a className="beta-muted" href={campaign.targetUrl} target="_blank" rel="noreferrer">
                {campaign.targetUrl}
              </a>
            )}
          </div>
        </div>
        <div className="beta-header-actions">
          <a className="beta-btn" href={campaignReportUrl(campaign._id)}>
            <FileDown size={14} aria-hidden /> Rapport
          </a>
          <button type="button" className="beta-btn beta-btn-primary" onClick={toggleStatus}>
            {campaign.status === 'RUNNING' ? (
              <>
                <Square size={14} aria-hidden /> Clore la campagne
              </>
            ) : (
              <>
                <Play size={14} aria-hidden /> Ouvrir aux testeurs
              </>
            )}
          </button>
        </div>
      </header>

      {campaign.status !== 'RUNNING' && (
        <p className="beta-banner">
          {campaign.status === 'DRAFT'
            ? 'Campagne en brouillon : les liens des testeurs ne fonctionnent pas encore.'
            : 'Campagne close : les liens des testeurs ne fonctionnent plus.'}
        </p>
      )}

      <nav className="beta-tabs" aria-label="Sections de la campagne">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`beta-tab${tab === entry.id ? ' active' : ''}`}
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
          >
            {entry.label}
            {entry.id === 'findings' && openFindings > 0 && <span className="beta-tab-count">{openFindings}</span>}
          </button>
        ))}
      </nav>

      <div className="beta-panel">
        {tab === 'coverage' && <CoverageGrid scenarios={scenarios} testers={testers} coverage={coverage} />}
        {tab === 'findings' && <FindingsQueue runs={runs} onChanged={load} />}
        {tab === 'scenarios' && <ScenarioPanel campaignId={campaign._id} scenarios={scenarios} onChanged={load} />}
        {tab === 'testers' && <TesterPanel campaignId={campaign._id} testers={testers} onChanged={load} />}
      </div>
    </div>
  )
}
