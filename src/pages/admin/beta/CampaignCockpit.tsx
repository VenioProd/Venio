import PageHeader from '../../../components/admin/ui/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import CoverageGrid from './CoverageGrid'
import FindingsQueue from './FindingsQueue'
import ScenarioPanel from './ScenarioPanel'
import TesterPanel from './TesterPanel'
import './Beta.css'
import '../Production.css'

type Tab = 'coverage' | 'findings' | 'scenarios' | 'testers'

const TABS: Array<{ id: Tab; labelKey: MessageKey }> = [
  { id: 'coverage', labelKey: 'beta.cockpit.tabCoverage' },
  { id: 'findings', labelKey: 'beta.cockpit.tabFindings' },
  { id: 'scenarios', labelKey: 'beta.cockpit.tabScenarios' },
  { id: 'testers', labelKey: 'beta.cockpit.tabTesters' },
]

export default function CampaignCockpit() {
  const { t } = useI18n()
  const { campaignId } = useParams<{ campaignId: string }>()
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [runs, setRuns] = useState<BetaRun[]>([])
  const [tab, setTab] = useState<Tab>('coverage')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadedOnce = useRef(false)

  const load = useCallback(async () => {
    if (!campaignId) return
    // Seul le premier affichage montre « Chargement » : un rechargement en
    // cours de travail démonterait l'écran, et emporterait avec lui le lien
    // d'invitation qui vient d'être affiché — un secret qu'on ne peut pas
    // relire.
    if (!loadedOnce.current) setLoading(true)
    setError(null)
    try {
      const [detailResult, runsResult] = await Promise.all([getCampaign(campaignId), listRuns(campaignId)])
      setDetail(detailResult)
      setRuns(runsResult.runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('beta.admin.loadFailed'))
    } finally {
      loadedOnce.current = true
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

  if (loading) return <p className="beta-muted beta-workspace">{t('beta.shared.loading')}</p>
  if (error) return <p className="beta-error beta-workspace">{error}</p>
  if (!detail) return null

  const { campaign, scenarios, testers, coverage } = detail
  const openFindings = runs.filter(
    (run) => run.verdict !== 'WORKS' && (run.status === 'OPEN' || run.status === 'ACKNOWLEDGED'),
  ).length

  return (
    <div className="beta-workspace production-page production-beta-detail">
      <PageHeader
        eyebrow={t('beta.admin.title')}
        title={campaign.name}
        subtitle={
          campaign.targetUrl && (
            <a className="beta-muted" href={campaign.targetUrl} target="_blank" rel="noreferrer">
              {campaign.targetUrl}
            </a>
          )
        }
        actions={
          <div className="beta-header-actions">
            <Link to="/admin/dev/recette" className="beta-back" aria-label={t('beta.cockpit.backAria')}>
              <ArrowLeft size={16} aria-hidden />
            </Link>
            <a className="beta-btn" href={campaignReportUrl(campaign._id)}>
              <FileDown size={14} aria-hidden /> {t('beta.cockpit.report')}
            </a>
            <button type="button" className="beta-btn beta-btn-primary" onClick={toggleStatus}>
              {campaign.status === 'RUNNING' ? (
                <>
                  <Square size={14} aria-hidden /> {t('beta.cockpit.close')}
                </>
              ) : (
                <>
                  <Play size={14} aria-hidden /> {t('beta.cockpit.open')}
                </>
              )}
            </button>
          </div>
        }
      />

      {campaign.status !== 'RUNNING' && (
        <p className="beta-banner">
          {campaign.status === 'DRAFT' ? t('beta.cockpit.draftBanner') : t('beta.cockpit.closedBanner')}
        </p>
      )}

      <nav className="beta-tabs" aria-label={t('beta.cockpit.sectionsAria')}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`beta-tab${tab === entry.id ? ' active' : ''}`}
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
          >
            {t(entry.labelKey)}
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
