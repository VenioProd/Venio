import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import {
  DEV_AI_MODEL_LABEL,
  DEV_ISSUE_COMMENT_KIND_LABEL,
  DEV_REASONING_EFFORT_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  TYPE_LABEL,
  type DevIssue,
  type DevIssueComment,
  type DevIssueGithubLink,
  type DevAiModel,
  type DevIssueCommentKind,
  type DevIssueExecutionProfile,
  type DevIssuePriority,
  type DevReasoningEffort,
  type DevIssueStatus,
  type DevIssueType,
} from '../../../services/dev'
import { useI18n } from '../../../context/I18nContext'
import { formatRelative } from './helpers'
import GithubLinkPanel from './GithubLinkPanel'
import AgentLaunchControl from './AgentLaunchControl'

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
  onAddComment: (comment: { body: string; kind: DevIssueCommentKind; context: string }) => void
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
  const { t } = useI18n()
  const [commentKind, setCommentKind] = useState<DevIssueCommentKind>('NOTE')
  const [commentContext, setCommentContext] = useState('')
  const executionProfile: DevIssueExecutionProfile = issue.executionProfile ?? {
    recommendedModel: null,
    reasoningEffort: null,
    context: '',
    executionPlan: '',
    verificationPlan: '',
    handoff: '',
  }
  const updateExecutionProfile = (patch: Partial<DevIssueExecutionProfile>) => {
    const next = { ...executionProfile, ...patch }
    setIssue((previous) => (previous ? { ...previous, executionProfile: next } : previous))
    return next
  }
  return (
    <aside className="dev-detail">
      <div className="dev-detail-header">
        <span className="dev-detail-id">
          {typeof issue.project === 'object' ? issue.project.key : ''}-{issue.number} ·{' '}
          {issue.reporter?.name || issue.reporter?.email || ''}
        </span>
        <button className="dev-detail-close" onClick={onClose} aria-label={t('common.close')}>
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
          <span className="dev-detail-meta-label">{t('devA.detail.status')}</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.status}
              onChange={(e) => onPatch(issue._id, { status: e.target.value as DevIssueStatus })}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.priority')}</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.priority}
              onChange={(e) => onPatch(issue._id, { priority: e.target.value as DevIssuePriority })}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.type')}</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={issue.type}
              onChange={(e) => onPatch(issue._id, { type: e.target.value as DevIssueType })}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.labels')}</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              placeholder={t('devA.detail.labelsPlaceholder')}
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

          <span className="dev-detail-meta-label">{t('devA.detail.dueDate')}</span>
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

          <span className="dev-detail-meta-label">{t('devA.detail.estimate')}</span>
          <span className="dev-detail-meta-value">
            <input
              type="number"
              min={0}
              max={999}
              disabled={!canManage}
              value={issue.estimate ?? ''}
              onChange={(e) =>
                onPatch(issue._id, {
                  estimate: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.cycle')}</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              value={issue.cycle ?? ''}
              placeholder={t('devA.detail.cyclePlaceholder')}
              onChange={(e) => setIssue((p) => (p ? { ...p, cycle: e.target.value || null } : p))}
              onBlur={() => canManage && onPatch(issue._id, { cycle: issue.cycle || null })}
            />
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.agent')}</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              value={issue.agentAssignee ?? ''}
              placeholder="Kuro, Hashirama..."
              onChange={(e) => setIssue((p) => (p ? { ...p, agentAssignee: e.target.value || null } : p))}
              onBlur={() => canManage && onPatch(issue._id, { agentAssignee: issue.agentAssignee || null })}
            />
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.creatorModel')}</span>
          <span className="dev-detail-meta-value" style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            {issue.createdByModel || t('devA.workspace.creatorModelUnset')}
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.recommendedModel')}</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={executionProfile.recommendedModel ?? ''}
              onChange={(e) =>
                updateExecutionProfile({ recommendedModel: (e.target.value || null) as DevAiModel | null })
              }
              onBlur={() => canManage && onPatch(issue._id, { executionProfile: issue.executionProfile })}
            >
              <option value="">{t('devA.detail.autoUnset')}</option>
              {Object.entries(DEV_AI_MODEL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.reasoning')}</span>
          <span className="dev-detail-meta-value">
            <select
              disabled={!canManage}
              value={executionProfile.reasoningEffort ?? ''}
              onChange={(e) =>
                updateExecutionProfile({ reasoningEffort: (e.target.value || null) as DevReasoningEffort | null })
              }
              onBlur={() => canManage && onPatch(issue._id, { executionProfile: issue.executionProfile })}
            >
              <option value="">{t('devA.detail.autoUnset')}</option>
              {Object.entries(DEV_REASONING_EFFORT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.blocker')}</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              value={issue.blockedReason ?? ''}
              placeholder={t('devA.detail.blockerPlaceholder')}
              onChange={(e) => setIssue((p) => (p ? { ...p, blockedReason: e.target.value || null } : p))}
              onBlur={() => canManage && onPatch(issue._id, { blockedReason: issue.blockedReason || null })}
            />
          </span>

          <span className="dev-detail-meta-label">Linear</span>
          <span className="dev-detail-meta-value">
            <input
              disabled={!canManage}
              value={issue.external?.linearIdentifier ?? ''}
              placeholder={t('devA.detail.linearPlaceholder')}
              onChange={(e) =>
                setIssue((p) =>
                  p
                    ? {
                        ...p,
                        external: {
                          linearId: p.external?.linearId ?? null,
                          linearUrl: p.external?.linearUrl ?? null,
                          linearIdentifier: e.target.value || null,
                        },
                      }
                    : p,
                )
              }
              onBlur={() => canManage && onPatch(issue._id, { external: issue.external })}
            />
          </span>

          <span className="dev-detail-meta-label">{t('devA.detail.created')}</span>
          <span className="dev-detail-meta-value" style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>
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
          placeholder={t('devA.detail.descriptionPlaceholder')}
          disabled={!canManage}
          value={issue.description}
          onChange={(e) => setIssue((p) => (p ? { ...p, description: e.target.value } : p))}
          onBlur={() => canManage && onPatch(issue._id, { description: issue.description })}
        />

        <div className="dev-detail-section">{t('devA.detail.briefHeading')}</div>
        {(
          [
            ['context', t('devA.detail.briefContext'), t('devA.detail.briefContextPlaceholder')],
            ['executionPlan', t('devA.detail.briefPlan'), t('devA.detail.briefPlanPlaceholder')],
            ['verificationPlan', t('devA.detail.briefVerification'), t('devA.detail.briefVerificationPlaceholder')],
            ['handoff', t('devA.detail.briefHandoff'), t('devA.detail.briefHandoffPlaceholder')],
          ] as const
        ).map(([field, label, placeholder]) => (
          <label key={field} className="dev-detail-meta-label" style={{ display: 'block', marginTop: 10 }}>
            {label}
            <textarea
              className="dev-detail-description"
              style={{ minHeight: 72, marginTop: 5 }}
              disabled={!canManage}
              placeholder={placeholder}
              value={executionProfile[field]}
              onChange={(e) => updateExecutionProfile({ [field]: e.target.value })}
              onBlur={() => canManage && onPatch(issue._id, { executionProfile: issue.executionProfile })}
            />
          </label>
        ))}

        {typeof issue.project === 'object' && (
          <div className="dev-detail-section">
            {t('devA.detail.framedAgent')}
            <div style={{ marginTop: 8 }}>
              <AgentLaunchControl
                projectId={issue.project._id}
                issueId={issue._id}
                issueIdentifier={issue.identifier}
                issueTitle={issue.title}
                onLaunched={() => undefined}
              />
            </div>
          </div>
        )}

        <div className="dev-detail-section">{t('devA.detail.commentsHeading', { count: comments.length })}</div>
        <div className="dev-comments">
          {comments.map((c) => (
            <div key={c._id} className="dev-comment">
              <div className="dev-comment-meta">
                <span>
                  {DEV_ISSUE_COMMENT_KIND_LABEL[c.kind] || DEV_ISSUE_COMMENT_KIND_LABEL.NOTE} ·{' '}
                  {c.author?.name || c.author?.email || t('devA.detail.unknownAuthor')} · {formatRelative(c.createdAt)}
                </span>
                {(canManage || c.author?._id === user?._id) && (
                  <button className="dev-comment-delete" onClick={() => onDeleteComment(c._id)}>
                    {t('devA.detail.deleteComment')}
                  </button>
                )}
              </div>
              {c.context && <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 6 }}>{c.context}</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
            </div>
          ))}
          {comments.length === 0 && (
            <div style={{ color: 'var(--ink-faint)', fontSize: 12.5 }}>{t('devA.detail.noComments')}</div>
          )}
        </div>

        {canManage && (
          <div className="dev-comment-form">
            <div className="dev-comment-form-actions">
              <select value={commentKind} onChange={(e) => setCommentKind(e.target.value as DevIssueCommentKind)}>
                {Object.entries(DEV_ISSUE_COMMENT_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={commentContext}
                onChange={(e) => setCommentContext(e.target.value)}
                placeholder={t('devA.detail.commentContextPlaceholder')}
              />
            </div>
            <textarea
              placeholder={t('devA.detail.commentPlaceholder')}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="dev-comment-form-actions">
              <button
                className="dev-btn primary"
                onClick={() => {
                  onAddComment({ body: commentDraft.trim(), kind: commentKind, context: commentContext.trim() })
                  setCommentContext('')
                }}
                disabled={!commentDraft.trim()}
              >
                {t('devA.detail.comment')}
              </button>
            </div>
          </div>
        )}

        {canManage && (
          <div className="dev-danger-zone">
            <button className="dev-danger-btn" onClick={() => onDeleteIssue(issue._id)}>
              <Trash2 size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {t('devA.detail.deleteIssue')}
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
