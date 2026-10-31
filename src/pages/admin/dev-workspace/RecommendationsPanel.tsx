import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ExternalLink,
  FileWarning,
  GitPullRequest,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react'
import {
  fetchDevAgentLaunchAvailability,
  fetchDevProjectRecommendations,
  type DevAgentLaunchAvailability,
  type DevRecommendationItem,
  type DevRecommendationPriority,
  type DevRecommendationSection,
  type DevRecommendationSource,
  type DevRecommendationsPayload,
} from '../../../services/dev'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import AgentLaunchControl from './AgentLaunchControl'
import './RecommendationsPanel.css'

const SECTION_META: Record<
  DevRecommendationSection,
  { label: MessageKey; icon: typeof Sparkles; tone: 'accent' | 'add' | 'optim' | 'files' }
> = {
  improve: { label: 'devB.reco.sectionImprove', icon: Wrench, tone: 'accent' },
  add: { label: 'devB.reco.sectionAdd', icon: Lightbulb, tone: 'add' },
  optimize: { label: 'devB.reco.sectionOptimize', icon: Sparkles, tone: 'optim' },
  large_files: { label: 'devB.reco.sectionLargeFiles', icon: FileWarning, tone: 'files' },
}

const PRIORITY_META: Record<DevRecommendationPriority, { label: MessageKey; color: string }> = {
  critical: { label: 'devB.reco.prioCritical', color: '#ef4444' },
  high: { label: 'devB.reco.prioHigh', color: '#f97316' },
  medium: { label: 'devB.reco.prioMedium', color: '#06b6d4' },
  low: { label: 'devB.reco.prioLow', color: '#64748b' },
}

const SOURCE_LABEL: Record<DevRecommendationSource, string> = {
  issues: 'Issue',
  pull_requests: 'PR',
  code_metrics: 'Code',
  backlog: 'Backlog',
  roadmap: 'Roadmap',
  labels: 'Labels',
  ci: 'CI',
}

function relativeFR(iso: string | null | undefined): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) {
    const future = -diff
    if (future < 60_000) return translate('devB.rel.inLessThanMin')
    if (future < 3_600_000) return translate('devB.rel.inMin', { n: Math.round(future / 60_000) })
    if (future < 86_400_000) return translate('devB.rel.inHour', { n: Math.round(future / 3_600_000) })
    return translate('devB.rel.inDay', { n: Math.round(future / 86_400_000) })
  }
  if (diff < 60_000) return translate('devB.rel.justNowCurly')
  if (diff < 3_600_000) return translate('devB.rel.minAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return translate('devB.rel.hourAgo', { n: Math.floor(diff / 3_600_000) })
  return translate('devB.rel.dayAgo', { n: Math.floor(diff / 86_400_000) })
}

interface ItemRowProps {
  item: DevRecommendationItem
  projectId: string
  agentAvailability: DevAgentLaunchAvailability | null
  onOpenIssue: (issueId: string) => void
}

const ItemRow = ({ item, projectId, agentAvailability, onOpenIssue }: ItemRowProps) => {
  const { t } = useI18n()
  const p = PRIORITY_META[item.priority]
  const linkedIssueId = item.actions.find((action) => action.kind === 'open_issue' && action.issueId)?.issueId ?? null
  return (
    <li className={`reco-row tone-${item.priority}`} style={{ ['--p-color' as never]: p.color }}>
      <span className="reco-row-dot" aria-hidden />
      <div className="reco-row-main">
        <div className="reco-row-title">{item.title}</div>
        {item.description && <div className="reco-row-desc">{item.description}</div>}
        <div className="reco-row-badges">
          <span className="reco-badge reco-badge-prio">{t(p.label)}</span>
          <span className="reco-badge reco-badge-source">{SOURCE_LABEL[item.source]}</span>
          {item.badges.slice(0, 4).map((b, idx) => (
            <span key={`${item.id}-b-${idx}`} className="reco-badge">
              {b}
            </span>
          ))}
          {item.metric && (
            <span className="reco-badge reco-badge-metric">
              {t('devB.reco.metric', { label: item.metric.label })} <strong>{item.metric.value}</strong>
            </span>
          )}
        </div>
        <details className="reco-row-evidence" open>
          <summary>
            {t('devB.reco.evidenceSummary', {
              source: item.evidence.source,
              observed: relativeFR(item.evidence.observedAt) || t('devB.reco.evidenceUnavailable'),
            })}
          </summary>
          <span>{t('devB.reco.evidenceLimit', { limit: item.evidence.limitation })}</span>
        </details>
      </div>
      {item.actions.length > 0 && (
        <div className="reco-row-actions">
          {item.actions.map((action, idx) => {
            if (action.kind === 'open_issue' && action.issueId) {
              return (
                <button
                  key={`${item.id}-a-${idx}`}
                  type="button"
                  className="reco-action-btn"
                  onClick={() => onOpenIssue(action.issueId!)}
                  title={action.label}
                >
                  <ListChecks size={11} /> {action.label}
                </button>
              )
            }
            if (
              (action.kind === 'open_pr' || action.kind === 'open_file' || action.kind === 'open_url') &&
              action.href
            ) {
              const Icon = action.kind === 'open_pr' ? GitPullRequest : ExternalLink
              return (
                <a
                  key={`${item.id}-a-${idx}`}
                  className="reco-action-btn"
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={action.label}
                >
                  <Icon size={11} /> {action.label}
                </a>
              )
            }
            return null
          })}
          {linkedIssueId && agentAvailability?.available && (
            <AgentLaunchControl
              projectId={projectId}
              issueId={linkedIssueId}
              issueIdentifier={item.badges.find((badge) => /^[A-Z][A-Z0-9]{1,7}-\d+$/.test(badge)) || 'Issue'}
              issueTitle={item.title}
              recommendationId={item.id}
              availability={agentAvailability}
              compact
            />
          )}
        </div>
      )}
    </li>
  )
}

interface SectionCardProps {
  section: DevRecommendationSection
  items: DevRecommendationItem[]
  projectId: string
  agentAvailability: DevAgentLaunchAvailability | null
  onOpenIssue: (issueId: string) => void
}

const SectionCard = ({ section, items, projectId, agentAvailability, onOpenIssue }: SectionCardProps) => {
  const { t } = useI18n()
  const meta = SECTION_META[section]
  const Icon = meta.icon
  return (
    <div className={`reco-section reco-tone-${meta.tone}`}>
      <header className="reco-section-header">
        <span className="reco-section-kicker">
          <Icon size={12} /> {t(meta.label)}
        </span>
        <span className="reco-section-meta">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <div className="reco-empty">{t('devB.reco.emptySection')}</div>
      ) : (
        <ul className="reco-list">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              projectId={projectId}
              agentAvailability={agentAvailability}
              onOpenIssue={onOpenIssue}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface RecommendationsPanelProps {
  projectId: string
  onOpenIssue: (issueId: string) => void
}

const RecommendationsPanel = ({ projectId, onOpenIssue }: RecommendationsPanelProps) => {
  const { user } = useAuth()
  const { t } = useI18n()
  const [data, setData] = useState<DevRecommendationsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentAvailability, setAgentAvailability] = useState<DevAgentLaunchAvailability | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(
    async (force = false) => {
      setLoading(true)
      setError(null)
      try {
        const payload = await fetchDevProjectRecommendations(projectId, { refresh: force })
        setData(payload)
      } catch (e) {
        setError(e instanceof Error ? e.message : translate('devB.common.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    load(false)
  }, [load])

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      setAgentAvailability(null)
      return
    }
    let cancelled = false
    void fetchDevAgentLaunchAvailability(projectId)
      .then((availability) => {
        if (!cancelled) setAgentAvailability(availability)
      })
      .catch(() => {
        if (!cancelled) setAgentAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, user?.role])

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1)
      if (data && data.nextRefreshAt) {
        const next = new Date(data.nextRefreshAt).getTime()
        if (Date.now() > next + 5_000) {
          load(false)
        }
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [data, load])

  const sections = data?.sections
  const hasContent = useMemo(() => {
    if (!sections) return false
    return (
      sections.improve.length > 0 ||
      sections.add.length > 0 ||
      sections.optimize.length > 0 ||
      sections.large_files.length > 0
    )
  }, [sections])

  return (
    <section className="reco-panel">
      <header className="reco-panel-header">
        <div className="reco-panel-title">
          <Sparkles size={14} />
          <h2>{t('devB.reco.title')}</h2>
          <span className="reco-panel-subtitle">{t('devB.reco.subtitle')}</span>
        </div>
        <div className="reco-panel-meta">
          {data && (
            <>
              <span className="reco-panel-stat">{t('devB.reco.suggestions', { count: data.counts.total })}</span>
              {data.counts.bySeverity.critical > 0 && (
                <span className="reco-panel-stat tone-critical">
                  <AlertOctagon size={11} /> {t('devB.reco.criticalCount', { count: data.counts.bySeverity.critical })}
                </span>
              )}
              <span
                className="reco-panel-stat"
                title={t('devB.reco.sourcesTitle', {
                  list:
                    [data.source.issues && 'issues', data.source.github && 'github', data.source.code && 'code']
                      .filter(Boolean)
                      .join(', ') || t('devB.reco.sourcesNone'),
                })}
              >
                {t('devB.reco.freshness', {
                  state: data.fromCache ? t('devB.reco.cached') : t('devB.reco.fresh'),
                  updated: relativeFR(data.generatedAt),
                  next: relativeFR(data.nextRefreshAt),
                })}
              </span>
            </>
          )}
          <button
            type="button"
            className="reco-refresh-btn"
            onClick={() => load(true)}
            disabled={loading}
            title={t('devB.reco.refreshTitle')}
            aria-label={t('devB.common.refresh')}
          >
            <RefreshCw size={11} className={loading ? 'reco-spin' : undefined} />
            {loading ? t('devB.reco.computing') : t('devB.common.refresh')}
          </button>
        </div>
      </header>

      {error && (
        <div className="reco-error">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {!data && !error && <div className="reco-empty reco-empty-loading">{t('devB.reco.computingAll')}</div>}

      {data && data.status === 'partial' && data.reasons.length > 0 && (
        <details className="reco-warnings">
          <summary>
            <AlertTriangle size={11} /> {t('devB.reco.partial', { count: data.reasons.length })}
          </summary>
          <ul>
            {data.reasons.slice(0, 4).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}

      {data && (
        <div className="reco-grid">
          <SectionCard
            section="improve"
            items={sections!.improve}
            projectId={projectId}
            agentAvailability={agentAvailability}
            onOpenIssue={onOpenIssue}
          />
          <SectionCard
            section="add"
            items={sections!.add}
            projectId={projectId}
            agentAvailability={agentAvailability}
            onOpenIssue={onOpenIssue}
          />
          <SectionCard
            section="optimize"
            items={sections!.optimize}
            projectId={projectId}
            agentAvailability={agentAvailability}
            onOpenIssue={onOpenIssue}
          />
          <SectionCard
            section="large_files"
            items={sections!.large_files}
            projectId={projectId}
            agentAvailability={agentAvailability}
            onOpenIssue={onOpenIssue}
          />
        </div>
      )}

      {data && !hasContent && data.status !== 'partial' && (
        <div className="reco-empty">
          {t('devB.reco.nothingActionable', { hours: Math.round(data.ttlSeconds / 3600) })}
        </div>
      )}
    </section>
  )
}

export default RecommendationsPanel
