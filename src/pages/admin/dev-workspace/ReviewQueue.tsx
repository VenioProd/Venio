import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, GitPullRequest, Keyboard, Undo2, X } from 'lucide-react'
import {
  addDevIssueComment,
  getDevIssue,
  listDevIssues,
  updateDevIssue,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  TYPE_COLOR,
  TYPE_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevProject,
} from '../../../services/dev'
import { CI_STATUS_LABEL, ciStatusTone, formatRelative, PRIORITY_ICON } from './helpers'
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
}: {
  projects: DevProject[]
  onClose: () => void
  onChanged: () => void
}) {
  const [queue, setQueue] = useState<DevIssue[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [detail, setDetail] = useState<{ issue: DevIssue; comments: DevIssueComment[] } | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectDraft, setRejectDraft] = useState('')
  const [processed, setProcessed] = useState(0)
  const [projectFilter, setProjectFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listDevIssues({ status: 'IN_REVIEW', project: projectFilter || undefined })
      // Les plus anciennes d'abord : ce sont elles qui attendent depuis le plus longtemps.
      const sorted = [...data.issues].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      setQueue(sorted)
      setActiveIndex(0)
      setRejectOpen(false)
      setRejectDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la file de revue')
    } finally {
      setLoading(false)
    }
  }, [projectFilter])

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
        if (!cancelled) console.error(err)
      })
    return () => {
      cancelled = true
    }
  }, [activeId])

  const goNext = useCallback(() => {
    setActiveIndex((i) => Math.min(i + 1, Math.max(0, queue.length - 1)))
    setRejectOpen(false)
  }, [queue.length])

  const goPrev = useCallback(() => {
    setActiveIndex((i) => Math.max(i - 1, 0))
    setRejectOpen(false)
  }, [])

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
    if (!active || acting) return
    setActing(true)
    setError(null)
    try {
      await updateDevIssue(active._id, { status: 'DONE' })
      removeFromQueue(active._id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'approbation")
    } finally {
      setActing(false)
    }
  }, [active, acting, onChanged, removeFromQueue])

  const submitReject = useCallback(async () => {
    const text = rejectDraft.trim()
    if (!active || !text || acting) return
    setActing(true)
    setError(null)
    try {
      await addDevIssueComment(active._id, text)
      await updateDevIssue(active._id, { status: 'IN_PROGRESS' })
      removeFromQueue(active._id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du renvoi')
    } finally {
      setActing(false)
    }
  }, [active, acting, onChanged, rejectDraft, removeFromQueue])

  // Raccourcis clavier (ignorés quand le focus est dans un champ).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
        if (queue.length > 0) setRejectOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approve, goNext, goPrev, onClose, queue.length])

  const activeProject = active && typeof active.project === 'object' ? active.project : null
  const lastComments = detail ? detail.comments.slice(-5) : []
  const github = detail?.issue.github

  return (
    <div className="review-queue-overlay" role="dialog" aria-label="File de revue">
      <header className="review-queue-header">
        <button className="review-queue-close" onClick={onClose} title="Fermer (Esc)">
          <X size={16} />
        </button>
        <div className="review-queue-heading">
          <h2>À valider</h2>
          <span className="review-queue-sub">
            {processed} traitée(s) · {queue.length} restante(s)
          </span>
        </div>
        <select
          className="dev-select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label="Filtrer par projet"
        >
          <option value="">Tous projets</option>
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
          <button className="dev-btn subtle" onClick={load}>
            Réessayer
          </button>
        </div>
      )}

      {loading ? (
        <div className="review-queue-empty">Chargement…</div>
      ) : queue.length === 0 ? (
        <div className="review-queue-empty">
          <span className="review-queue-empty-emoji" aria-hidden>
            🎉
          </span>
          <span>Rien à valider</span>
          <button className="dev-btn primary" onClick={onClose}>
            Fermer
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
                      {detail ? 'Pas de description.' : 'Chargement…'}
                    </div>
                  )}

                  {github?.prUrl && (
                    <div className="review-queue-github">
                      <span className="review-queue-github-title">
                        <GitPullRequest size={14} /> Pull request
                      </span>
                      <a href={github.prUrl} target="_blank" rel="noopener noreferrer">
                        {github.prNumber ? `#${github.prNumber}` : github.prUrl}
                      </a>
                      {github.branch && <code className="review-queue-branch">{github.branch}</code>}
                      {github.ciStatus && (
                        <span className={`review-queue-ci tone-${ciStatusTone(github.ciStatus)}`}>
                          CI : {CI_STATUS_LABEL[github.ciStatus]}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="review-queue-comments">
                    <span className="review-queue-section-label">
                      Commentaires{detail ? ` (${detail.comments.length})` : ''}
                    </span>
                    {!detail ? (
                      <div className="review-queue-muted">Chargement…</div>
                    ) : lastComments.length === 0 ? (
                      <div className="review-queue-muted">Aucun commentaire.</div>
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
                        placeholder="Pourquoi cette issue est renvoyée ? (obligatoire)"
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
                          Annuler
                        </button>
                        <button
                          className="dev-btn primary"
                          disabled={!rejectDraft.trim() || acting}
                          onClick={() => void submitReject()}
                        >
                          Renvoyer en cours (⌘⏎)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <footer className="review-queue-footer">
            <button className="dev-btn primary" disabled={acting} onClick={() => void approve()}>
              <Check size={13} /> Approuver (a)
            </button>
            <button className="dev-btn" disabled={acting} onClick={() => setRejectOpen(true)}>
              <Undo2 size={13} /> Renvoyer (r)
            </button>
            <span className="review-queue-nav">
              <button className="dev-btn subtle" onClick={goPrev} title="Précédent (k)">
                <ChevronUp size={13} />
              </button>
              <button className="dev-btn subtle" onClick={goNext} title="Suivant (j)">
                <ChevronDown size={13} />
              </button>
            </span>
            <span className="review-queue-counter">
              <Keyboard size={13} /> {processed} traitée(s) · {queue.length} restante(s)
            </span>
          </footer>
        </>
      )}
    </div>
  )
}

export default ReviewQueue
