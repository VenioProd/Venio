import { Activity, CheckCircle2, GitBranch, GitPullRequest, X, XCircle } from 'lucide-react'
import type { DevIssue, DevIssueGithubLink, DevCiStatus } from '../../../services/dev'
import { useI18n } from '../../../context/I18nContext'
import { CI_STATUS_LABEL, CI_STATUS_LABEL_KEYS, ciStatusTone } from './helpers'

interface GithubLinkPanelProps {
  issue: DevIssue
  canManage: boolean
  onPatch: (patch: DevIssueGithubLink) => void
  onClear: () => void
}

export default function GithubLinkPanel({ issue, canManage, onPatch, onClear }: GithubLinkPanelProps) {
  const { t } = useI18n()
  const link = issue.github
  const isMerged = Boolean(link?.mergedAt)

  if (!link && !canManage) return null
  if (!link) {
    return (
      <div className="dev-detail-github empty">
        <button
          type="button"
          className="dev-btn subtle"
          onClick={() =>
            onPatch({
              repo: null,
              prNumber: null,
              prUrl: null,
              branch: null,
              commitSha: null,
              ciStatus: null,
              mergedAt: null,
            })
          }
        >
          <GitBranch size={12} /> {t('devA.github.attach')}
        </button>
      </div>
    )
  }

  const tone = ciStatusTone(link.ciStatus)
  return (
    <div className="dev-detail-github">
      <div className="dev-detail-github-header">
        <span className="dev-detail-github-title">
          <GitPullRequest size={13} />
          {isMerged
            ? t('devA.github.mergedPr')
            : link.prNumber
              ? t('devA.github.prNumber', { number: link.prNumber })
              : t('devA.github.link')}
        </span>
        {link.ciStatus && (
          <span className={`dev-detail-github-ci tone-${tone}`} title={CI_STATUS_LABEL[link.ciStatus] || link.ciStatus}>
            {tone === 'ok' && <CheckCircle2 size={12} />}
            {tone === 'fail' && <XCircle size={12} />}
            {tone === 'warn' && <Activity size={12} />}
            {CI_STATUS_LABEL[link.ciStatus] || link.ciStatus}
          </span>
        )}
        {canManage && (
          <button className="dev-detail-github-clear" type="button" onClick={onClear} title={t('devA.github.detach')}>
            <X size={11} />
          </button>
        )}
      </div>
      <div className="dev-detail-github-grid">
        <label>
          <span>{t('devA.github.repo')}</span>
          <input
            disabled={!canManage}
            defaultValue={link.repo ?? ''}
            placeholder="org/repo"
            onBlur={(e) => canManage && onPatch({ ...link, repo: e.target.value.trim() || null })}
          />
        </label>
        <label>
          <span>{t('devA.github.branch')}</span>
          <input
            disabled={!canManage}
            defaultValue={link.branch ?? ''}
            placeholder="feature/…"
            onBlur={(e) => canManage && onPatch({ ...link, branch: e.target.value.trim() || null })}
          />
        </label>
        <label>
          <span>{t('devA.github.pr')}</span>
          <input
            disabled={!canManage}
            type="number"
            min={1}
            defaultValue={link.prNumber ?? ''}
            onBlur={(e) =>
              canManage &&
              onPatch({
                ...link,
                prNumber: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          <span>{t('devA.github.prUrl')}</span>
          <input
            disabled={!canManage}
            defaultValue={link.prUrl ?? ''}
            placeholder="https://github.com/…/pull/123"
            onBlur={(e) => canManage && onPatch({ ...link, prUrl: e.target.value.trim() || null })}
          />
        </label>
        <label>
          <span>{t('devA.github.ci')}</span>
          <select
            disabled={!canManage}
            value={link.ciStatus ?? ''}
            onChange={(e) =>
              canManage && onPatch({ ...link, ciStatus: (e.target.value || null) as DevCiStatus | null })
            }
          >
            <option value="">—</option>
            <option value="PENDING">{t(CI_STATUS_LABEL_KEYS.PENDING)}</option>
            <option value="RUNNING">{t(CI_STATUS_LABEL_KEYS.RUNNING)}</option>
            <option value="SUCCESS">{t(CI_STATUS_LABEL_KEYS.SUCCESS)}</option>
            <option value="FAILURE">{t(CI_STATUS_LABEL_KEYS.FAILURE)}</option>
            <option value="UNKNOWN">{t(CI_STATUS_LABEL_KEYS.UNKNOWN)}</option>
          </select>
        </label>
        <label>
          <span>{t('devA.github.merged')}</span>
          <input
            disabled={!canManage}
            type="date"
            value={link.mergedAt ? link.mergedAt.slice(0, 10) : ''}
            onChange={(e) =>
              canManage &&
              onPatch({
                ...link,
                mergedAt: e.target.value || null,
              })
            }
          />
        </label>
      </div>
      {link.prUrl && (
        <a className="dev-detail-github-link" href={link.prUrl} target="_blank" rel="noopener noreferrer">
          {link.prUrl}
        </a>
      )}
    </div>
  )
}
