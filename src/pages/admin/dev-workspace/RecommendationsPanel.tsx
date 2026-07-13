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
  fetchDevProjectRecommendations,
  type DevRecommendationItem,
  type DevRecommendationPriority,
  type DevRecommendationSection,
  type DevRecommendationSource,
  type DevRecommendationsPayload,
} from '../../../services/dev'
import './RecommendationsPanel.css'

const SECTION_META: Record<
  DevRecommendationSection,
  { label: string; icon: typeof Sparkles; tone: 'accent' | 'add' | 'optim' | 'files' }
> = {
  improve: { label: 'À améliorer', icon: Wrench, tone: 'accent' },
  add: { label: 'À ajouter ensuite', icon: Lightbulb, tone: 'add' },
  optimize: { label: 'Optimisations', icon: Sparkles, tone: 'optim' },
  large_files: { label: 'Fichiers volumineux', icon: FileWarning, tone: 'files' },
}

const PRIORITY_META: Record<DevRecommendationPriority, { label: string; color: string }> = {
  critical: { label: 'Critique', color: '#ef4444' },
  high: { label: 'Haute', color: '#f97316' },
  medium: { label: 'Moyenne', color: '#06b6d4' },
  low: { label: 'Basse', color: '#64748b' },
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
    if (future < 60_000) return 'dans <1 min'
    if (future < 3_600_000) return `dans ${Math.round(future / 60_000)} min`
    if (future < 86_400_000) return `dans ${Math.round(future / 3_600_000)} h`
    return `dans ${Math.round(future / 86_400_000)} j`
  }
  if (diff < 60_000) return 'à l’instant'
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`
  return `il y a ${Math.floor(diff / 86_400_000)} j`
}

interface ItemRowProps {
  item: DevRecommendationItem
  onOpenIssue: (issueId: string) => void
}

const ItemRow = ({ item, onOpenIssue }: ItemRowProps) => {
  const p = PRIORITY_META[item.priority]
  return (
    <li className={`reco-row tone-${item.priority}`} style={{ ['--p-color' as never]: p.color }}>
      <span className="reco-row-dot" aria-hidden />
      <div className="reco-row-main">
        <div className="reco-row-title">{item.title}</div>
        {item.description && <div className="reco-row-desc">{item.description}</div>}
        <div className="reco-row-badges">
          <span className="reco-badge reco-badge-prio">{p.label}</span>
          <span className="reco-badge reco-badge-source">{SOURCE_LABEL[item.source]}</span>
          {item.badges.slice(0, 4).map((b, idx) => (
            <span key={`${item.id}-b-${idx}`} className="reco-badge">{b}</span>
          ))}
          {item.metric && (
            <span className="reco-badge reco-badge-metric">
              {item.metric.label} : <strong>{item.metric.value}</strong>
            </span>
          )}
        </div>
        <details className="reco-row-evidence" open>
          <summary>
            Source : {item.evidence.source} · observé {relativeFR(item.evidence.observedAt) || 'indisponible'}
          </summary>
          <span>Limite : {item.evidence.limitation}</span>
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
        </div>
      )}
    </li>
  )
}

interface SectionCardProps {
  section: DevRecommendationSection
  items: DevRecommendationItem[]
  onOpenIssue: (issueId: string) => void
}

const SectionCard = ({ section, items, onOpenIssue }: SectionCardProps) => {
  const meta = SECTION_META[section]
  const Icon = meta.icon
  return (
    <div className={`reco-section reco-tone-${meta.tone}`}>
      <header className="reco-section-header">
        <span className="reco-section-kicker">
          <Icon size={12} /> {meta.label}
        </span>
        <span className="reco-section-meta">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <div className="reco-empty">Rien à signaler ici pour le moment.</div>
      ) : (
        <ul className="reco-list">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onOpenIssue={onOpenIssue} />
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
  const [data, setData] = useState<DevRecommendationsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchDevProjectRecommendations(projectId, { refresh: force })
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load(false) }, [load])

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
          <h2>Recommandations projet</h2>
          <span className="reco-panel-subtitle">
            ce qu’il faut améliorer, ajouter ou optimiser ensuite
          </span>
        </div>
        <div className="reco-panel-meta">
          {data && (
            <>
              <span className="reco-panel-stat">
                {data.counts.total} suggestion{data.counts.total > 1 ? 's' : ''}
              </span>
              {data.counts.bySeverity.critical > 0 && (
                <span className="reco-panel-stat tone-critical">
                  <AlertOctagon size={11} /> {data.counts.bySeverity.critical} critique
                  {data.counts.bySeverity.critical > 1 ? 's' : ''}
                </span>
              )}
              <span
                className="reco-panel-stat"
                title={`Source(s) : ${[
                  data.source.issues && 'issues',
                  data.source.github && 'github',
                  data.source.code && 'code',
                ]
                  .filter(Boolean)
                  .join(', ') || 'aucune'}`}
              >
                {data.fromCache ? 'cache' : 'frais'} · MAJ {relativeFR(data.generatedAt)} ·
                {' '}prochain {relativeFR(data.nextRefreshAt)}
              </span>
            </>
          )}
          <button
            type="button"
            className="reco-refresh-btn"
            onClick={() => load(true)}
            disabled={loading}
            title="Recalculer à partir des sources et du snapshot disponibles"
            aria-label="Rafraîchir"
          >
            <RefreshCw size={11} className={loading ? 'reco-spin' : undefined} />
            {loading ? 'Calcul…' : 'Rafraîchir'}
          </button>
        </div>
      </header>

      {error && (
        <div className="reco-error">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {!data && !error && (
        <div className="reco-empty reco-empty-loading">
          Calcul des recommandations…
        </div>
      )}

      {data && data.status === 'partial' && data.reasons.length > 0 && (
        <details className="reco-warnings">
          <summary>
            <AlertTriangle size={11} /> Données partielles ({data.reasons.length} source
            {data.reasons.length > 1 ? 's' : ''} indisponible{data.reasons.length > 1 ? 's' : ''})
          </summary>
          <ul>
            {data.reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </details>
      )}

      {data && (
        <div className="reco-grid">
          <SectionCard section="improve" items={sections!.improve} onOpenIssue={onOpenIssue} />
          <SectionCard section="add" items={sections!.add} onOpenIssue={onOpenIssue} />
          <SectionCard section="optimize" items={sections!.optimize} onOpenIssue={onOpenIssue} />
          <SectionCard section="large_files" items={sections!.large_files} onOpenIssue={onOpenIssue} />
        </div>
      )}

      {data && !hasContent && data.status !== 'partial' && (
        <div className="reco-empty">
          Aucune recommandation actionnable détectée pour le moment.
          {' '}Les recommandations sont recalculées toutes les {Math.round(data.ttlSeconds / 3600)} h
          {' '}à partir du snapshot périodique disponible.
        </div>
      )}
    </section>
  )
}

export default RecommendationsPanel
