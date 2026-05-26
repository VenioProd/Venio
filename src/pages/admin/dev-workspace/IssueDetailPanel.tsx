import { Trash2, X } from 'lucide-react'
import {
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  TYPE_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevIssueGithubLink,
  type DevIssuePriority,
  type DevIssueStatus,
  type DevIssueType,
} from '../../../services/dev'
import { formatRelative } from './helpers'
import GithubLinkPanel from './GithubLinkPanel'

interface User {
  _id?: string
  email?: string
}

interface Props {
  issue: DevIssue
  comments: DevIssueComment[]
  user: User | null
  canManage: boolean
  commentDraft: string
  setCommentDraft: (v: string) => void
  setIssue: (updater: (p: DevIssue | null) => DevIssue | null) => void
  onPatch: (
    id: string,
    patch: Partial<DevIssue> & { assignee?: string | null; github?: DevIssueGithubLink | null },
  ) => void | Promise<void>
  onClose: () => void
  onAddComment: () => void
  onDeleteComment: (id: string) => void
  onDeleteIssue: (id: string) => void
}

export default function IssueDetailPanel({
  issue,
  comments,
  user,
  canManage,
  commentDraft,
  setCommentDraft,
  setIssue,
  onPatch,
  onClose,
  onAddComment,
  onDeleteComment,
  onDeleteIssue,
}: Props) {
  return (
    <aside className="dev-detail">
      <div className="dev-detail-header">
        <span className="dev-detail-id">
          {typeof issue.project === 'object' ? issue.project.key : ''}-{issue.number}{' '}
          · {issue.reporter?.name || issue.reporter?.email || ''}
        </span>
        <button className="dev-detail-close" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>
      <div className="dev-detail-body">
        <input
          className="dev-detail-title-input"
          value={issue.title}
          disabled={!canManage}
          onChange={(e) => setIssue((p) => (p ? { ...p, title: e.target.value } : p))}
          onBlur={() => canManage && onPatch(issue._id, { title: issue.title })}
        />

        <div className="dev-detail-meta">
          <span className="dev-detail-meta-label">Statut</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.status}
              onChange={(e) => onPatch(issue._id, { status: e.target.value as DevIssueStatus })}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">Priorité</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.priority}
              onChange={(e) => onPatch(issue._id, { priority: e.target.value as DevIssuePriority })}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">Type</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.type}
              onChange={(e) => onPatch(issue._id, { type: e.target.value as DevIssueType })}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </span>

          <span className="dev-detail-meta-label">Labels</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              placeholder="virgules pour séparer"
              defaultValue={issue.labels.join(', ')}
              onBlur={(e) => {
                const labels = e.target.value
                  .split(',')
                  .map((l) => l.trim().toLowerCase())
                  .filter(Boolean)
                onPatch(issue._id, { labels })
              }}
            />
          </span>

          <span className="dev-detail-meta-label">Échéance</span>
          <span className="dev-detail-meta-value">
            <input
              type="date"
              disabled={!canManage}
              value={issue.dueDate ? issue.dueDate.slice(0, 10) : ''}
              onChange={(e) =>
                onPatch(issue._id, {
                  dueDate: e.target.value || null,
                })
              }
            />
          </span>

          <span className="dev-detail-meta-label">Créée</span>
          <span className="dev-detail-meta-value" style={{ fontSize: 12.5, color: '#94a3b8' }}>
            {formatRelative(issue.createdAt)}
          </span>
        </div>

        <GithubLinkPanel
          issue={issue}
          canManage={canManage}
          onPatch={(patch) => onPatch(issue._id, { github: patch })}
          onClear={() => onPatch(issue._id, { github: null })}
        />

        <textarea
          className="dev-detail-description"
          placeholder="Description / contexte / liens GitHub…"
          disabled={!canManage}
          value={issue.description}
          onChange={(e) => setIssue((p) => (p ? { ...p, description: e.target.value } : p))}
          onBlur={() => canManage && onPatch(issue._id, { description: issue.description })}
        />

        <div className="dev-detail-section">Commentaires ({comments.length})</div>
        <div className="dev-comments">
          {comments.map((c) => (
            <div key={c._id} className="dev-comment">
              <div className="dev-comment-meta">
                <span>{c.author?.name || c.author?.email || 'Inconnu'} · {formatRelative(c.createdAt)}</span>
                {(canManage || c.author?._id === user?._id) && (
                  <button className="dev-comment-delete" onClick={() => onDeleteComment(c._id)}>
                    supprimer
                  </button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
          {comments.length === 0 && (
            <div style={{ color: '#64748b', fontSize: 12.5 }}>Aucun commentaire</div>
          )}
        </div>

        {canManage && (
          <div className="dev-comment-form">
            <textarea
              placeholder="Ajouter un commentaire…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="dev-comment-form-actions">
              <button className="dev-btn primary" onClick={onAddComment} disabled={!commentDraft.trim()}>
                Commenter
              </button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="dev-danger-zone">
            <button className="dev-danger-btn" onClick={() => onDeleteIssue(issue._id)}>
              <Trash2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Supprimer l'issue
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
