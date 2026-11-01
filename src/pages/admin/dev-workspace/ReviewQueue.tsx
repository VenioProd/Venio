import { PRIORITY_COLOR, TYPE_COLOR } from './colors'
import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, GitPullRequest, Keyboard, Undo2, X } from 'lucide-react'
import {
  addDevIssueComment,
  getDevIssue,
  listDevIssues,
  updateDevIssue,
  PRIORITY_LABEL,
  TYPE_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevIssueEvent,
  type DevProject,
} from '../../../services/dev'
import { useI18n } from '../../../context/I18nContext'
import { CI_STATUS_LABEL, ciStatusTone, formatRelative, PRIORITY_ICON } from './helpers'
import { ReviewEvidence, criterion } from './ReviewEvidence'
import './ReviewQueue.css'

/**
 * File de revue « À valider » — triage séquentiel des issues IN_REVIEW.
 * a = approuver (DONE), r = renvoyer (IN_PROGRESS + commentaire obligatoire),
 * j/k = naviguer, Esc = fermer.
 */
export function ReviewQueue({
  projects,
  onClose,
  onChanged,
  canManage = false,
}: {
  canManage?: boolean
  projects: DevProject[]
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const loadRequest = useRef(0)
  const [detailRevision, setDetailRevision] = useState(0)
  const [queue, setQueue] = useState<DevIssue[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [detail, setDetail] = useState<{
    issue: DevIssue
    comments: DevIssueComment[]
    events: DevIssueEvent[]
  } | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectDraft, setRejectDraft] = useState('')
  const [processed, setProcessed] = useState(0)
  const [projectFilter, setProjectFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const [evidenceBusy, setEvidenceBusy] = useState(false)

  const load = useCallback(async () => {
    const request = ++loadRequest.current
    setDetail(null)
    setLoading(true)
    setError(null)
    try {
      const data = await listDevIssues({ status: 'IN_REVIEW', project: projectFilter || undefined, sort: 'oldest' })
      if (request !== loadRequest.current) return
      setDetailRevision((revision) => revision + 1)
      // Les plus anciennes d'abord : ce sont elles qui attendent depuis le plus longtemps.
      const sorted = [...data.issues].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      setQueue(sorted)
      setActiveIndex(0)
      setRejectOpen(false)
      setRejectDraft('')
    } catch (err) {
      if (request === loadRequest.current) setError(err instanceof Error ? err.message : t('devA.review.loadError'))
    } finally {
      if (request === loadRequest.current) setLoading(false)
    }
  }, [projectFilter, t])

  useEffect(() => {
    load()
  }, [load])

  const active = queue[activeIndex] ?? null
  const activeId = active?._id ?? null

  // Détail (description fraîche + commentaires) de l'issue active.
  useEffect(() => {
    if (!activeId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetail(null)
    getDevIssue(activeId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('devA.review.evidenceLoadError'))
      })
    return () => {
      cancelled = true
    }
  }, [activeId, detailRevision])

  const goNext = useCallback(() => {
    if (acting || evidenceBusy) return
    setActiveIndex((i) => Math.min(i + 1, Math.max(0, queue.length - 1)))
    setRejectOpen(false)
  }, [queue.length, acting, evidenceBusy])

  const goPrev = useCallback(() => {
    if (acting || evidenceBusy) return
    setActiveIndex((i) => Math.max(i - 1, 0))
    setRejectOpen(false)
  }, [acting, evidenceBusy])

  const removeFromQueue = useCallback(
    (id: string) => {
      setQueue((prev) => prev.filter((i) => i._id !== id))
      // L'issue suivante glisse au même index ; on borne au nouveau dernier élément.
      setActiveIndex((i) => Math.min(i, Math.max(0, queue.length - 2)))
      setProcessed((p) => p + 1)
      setRejectOpen(false)
      setRejectDraft('')
    },
    [queue.length],
  )

  const approve = useCallback(async () => {
    if (!canManage || !active || acting || evidenceBusy || !detail || detail.issue._id !== active._id) return
    if ((detail.issue.acceptanceCriteria ?? []).some((value) => !criterion(value).checked)) {
      setError(t('devA.review.criteriaFirst'))
      return
    }
    setActing(true)
    setError(null)
    try {
      const fresh = await getDevIssue(active._id)
      if (fresh.issue.status !== 'IN_REVIEW') throw new Error(t('devA.review.statusChanged'))
      if ((fresh.issue.acceptanceCriteria ?? []).some((value) => !criterion(value).checked))
        throw new Error(t('devA.review.criteriaPending'))
      await updateDevIssue(active._id, { status: 'DONE' })
      removeFromQueue(active._id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('devA.review.approveFailed'))
    } finally {
      setActing(false)
    }
  }, [canManage, active, acting, evidenceBusy, detail, onChanged, removeFromQueue, t])

  const submitReject = useCallback(async () => {
    const text = rejectDraft.trim()
    if (!canManage || !active || !text || acting || evidenceBusy) return
    setActing(true)
    setError(null)
    try {
      await addDevIssueComment(active._id, text)
      await updateDevIssue(active._id, { status: 'IN_PROGRESS' })
      removeFromQueue(active._id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('devA.review.rejectFailed'))
    } finally {
      setActing(false)
    }
  }, [canManage, active, acting, evidenceBusy, onChanged, rejectDraft, removeFromQueue, t])

  // Raccourcis clavier (ignorés quand le focus est dans un champ).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (acting || evidenceBusy) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'a') {
        e.preventDefault()
        void approve()
      } else if (e.key === 'r') {
        e.preventDefault()
        if (canManage && queue.length > 0) setRejectOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approve, goNext, goPrev, onClose, queue.length, acting, evidenceBusy, canManage])

  const activeProject = active && typeof active.project === 'object' ? active.project : null
  const lastComments = detail ? detail.comments.slice(-5) : []
  const github = detail?.issue.github

  return (
    <WorkspaceOverlayPortal>
      <div className="review-queue-overlay" role="dialog" aria-label={t('devA.review.aria')}>
        <header className="review-queue-header">
          <button
            className="review-queue-close"
            disabled={acting || evidenceBusy}
            onClick={onClose}
            title={t('devA.review.closeTitle')}
          >
            <X size={16} />
          </button>
          <div className="review-queue-heading">
            <h2>{t('devA.list.groupReview')}</h2>
            <span className="review-queue-sub">{t('devA.review.counter', { processed, remaining: queue.length })}</span>
          </div>
          <select
            className="dev-select"
            disabled={acting || evidenceBusy}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            aria-label={t('devA.review.filterAria')}
          >
            <option value="">{t('devA.toolbar.allProjects')}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.key} · {p.name}
              </option>
            ))}
          </select>
        </header>

        {error && (
          <div className="review-queue-error">
            {error}
            <button className="dev-btn subtle" disabled={acting || evidenceBusy} onClick={load}>
              {t('devA.common.retry')}
            </button>
          </div>
        )}

        {loading ? (
          <div className="review-queue-empty">{t('devA.common.loading')}</div>
        ) : queue.length === 0 ? (
          <div className="review-queue-empty">
            <span className="review-queue-empty-emoji" aria-hidden>
              🎉
            </span>
            <span>{t('devA.review.nothing')}</span>
            <button className="dev-btn primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            <div className="review-queue-body">
              <aside className="review-queue-list">
                {queue.map((issue, idx) => {
                  const project = typeof issue.project === 'object' ? issue.project : null
                  return (
                    <button
                      key={issue._id}
                      disabled={acting || evidenceBusy}
                      type="button"
                      className={'review-queue-item' + (idx === activeIndex ? ' active' : '')}
                      onClick={() => {
                        setActiveIndex(idx)
                        setRejectOpen(false)
                      }}
                    >
                      <span className="review-queue-item-id">
                        {project ? `${project.key}-${issue.number}` : issue.identifier}
                      </span>
                      <span className="review-queue-item-title">{issue.title}</span>
                      <span className="review-queue-item-meta">
                        {project && (
                          <span className="review-queue-item-project" style={{ color: project.color || '#7c5cff' }}>
                            {project.key}
                          </span>
                        )}
                        <span>{formatRelative(issue.updatedAt)}</span>
                      </span>
                    </button>
                  )
                })}
              </aside>

              <section className="review-queue-detail">
                {active && (
                  <>
                    <div className="review-queue-detail-head">
                      <span className="review-queue-detail-id">
                        {activeProject ? `${activeProject.key}-${active.number}` : active.identifier}
                      </span>
                      <span
                        className="review-queue-badge"
                        style={{ ['--badge-color' as never]: TYPE_COLOR[active.type] }}
                      >
                        {TYPE_LABEL[active.type]}
                      </span>
                      <span
                        className="review-queue-badge"
                        style={{ ['--badge-color' as never]: PRIORITY_COLOR[active.priority] }}
                      >
                        {PRIORITY_ICON[active.priority]} {PRIORITY_LABEL[active.priority]}
                      </span>
                    </div>
                    <h3 className="review-queue-detail-title">{active.title}</h3>

                    {detail?.issue.description ? (
                      <div className="review-queue-description">{detail.issue.description}</div>
                    ) : (
                      <div className="review-queue-description muted">
                        {detail ? t('devA.review.noDescription') : t('devA.common.loading')}
                      </div>
                    )}

                    {github?.prUrl && (
                      <div className="review-queue-github">
                        <span className="review-queue-github-title">
                          <GitPullRequest size={14} /> {t('devA.review.pullRequest')}
                        </span>
                        <a href={github.prUrl} target="_blank" rel="noopener noreferrer">
                          {github.prNumber ? `#${github.prNumber}` : github.prUrl}
                        </a>
                        {github.branch && <code className="review-queue-branch">{github.branch}</code>}
                        {github.ciStatus && (
                          <span className={`review-queue-ci tone-${ciStatusTone(github.ciStatus)}`}>
                            {t('devA.review.ciStatus', { status: CI_STATUS_LABEL[github.ciStatus] })}
                          </span>
                        )}
                      </div>
                    )}

                    {detail && (
                      <ReviewEvidence
                        key={detail.issue._id}
                        canManage={canManage && !acting}
                        issue={detail.issue}
                        comments={detail.comments}
                        events={detail.events ?? []}
                        onBusy={setEvidenceBusy}
                        onUpdated={(issue) => {
                          setDetail((current) => (current?.issue._id === issue._id ? { ...current, issue } : current))
                          onChanged()
                        }}
                        onEvidence={(comment) =>
                          setDetail((current) =>
                            current?.issue._id === detail.issue._id
                              ? { ...current, comments: [...current.comments, comment] }
                              : current,
                          )
                        }
                      />
                    )}

                    <div className="review-queue-comments">
                      <span className="review-queue-section-label">
                        {detail
                          ? t('devA.review.commentsCount', { count: detail.comments.length })
                          : t('devA.review.comments')}
                      </span>
                      {!detail ? (
                        <div className="review-queue-muted">{t('devA.common.loading')}</div>
                      ) : lastComments.length === 0 ? (
                        <div className="review-queue-muted">{t('devA.review.noComments')}</div>
                      ) : (
                        lastComments.map((c) => (
                          <div key={c._id} className="review-queue-comment">
                            <div className="review-queue-comment-meta">
                              <strong>{c.author?.name || c.author?.email || '—'}</strong>
                              <span>{formatRelative(c.createdAt)}</span>
                            </div>
                            <div className="review-queue-comment-body">{c.body}</div>
                          </div>
                        ))
                      )}
                    </div>

                    {rejectOpen && (
                      <div className="review-queue-reject">
                        <textarea
                          autoFocus
                          value={rejectDraft}
                          placeholder={t('devA.review.rejectPlaceholder')}
                          onChange={(e) => setRejectDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation()
                              setRejectOpen(false)
                            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault()
                              void submitReject()
                            }
                          }}
                        />
                        <div className="review-queue-reject-actions">
                          <button className="dev-btn subtle" onClick={() => setRejectOpen(false)}>
                            {t('common.cancel')}
                          </button>
                          <button
                            className="dev-btn primary"
                            disabled={!canManage || !rejectDraft.trim() || acting || evidenceBusy}
                            onClick={() => void submitReject()}
                          >
                            {t('devA.review.rejectSubmit')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>

            <footer className="review-queue-footer">
              <button
                className="dev-btn primary"
                disabled={
                  !canManage ||
                  acting ||
                  evidenceBusy ||
                  !detail ||
                  (detail.issue.acceptanceCriteria ?? []).some((value) => !criterion(value).checked)
                }
                onClick={() => void approve()}
              >
                <Check size={13} /> {t('devA.review.approve')}
              </button>
              <button
                className="dev-btn"
                disabled={!canManage || acting || evidenceBusy}
                onClick={() => setRejectOpen(true)}
              >
                <Undo2 size={13} /> {t('devA.review.reject')}
              </button>
              <span className="review-queue-nav">
                <button className="dev-btn subtle" onClick={goPrev} title={t('devA.review.previousTitle')}>
                  <ChevronUp size={13} />
                </button>
                <button className="dev-btn subtle" onClick={goNext} title={t('devA.review.nextTitle')}>
                  <ChevronDown size={13} />
                </button>
              </span>
              <span className="review-queue-counter">
                <Keyboard size={13} /> {t('devA.review.counter', { processed, remaining: queue.length })}
              </span>
            </footer>
          </>
        )}
      </div>
    </WorkspaceOverlayPortal>
  )
}

export default ReviewQueue
