import { DEV_CI_STATUSES, type DevCiStatus, type DevIssueGithubLink } from '../../models/DevIssue.js'

/**
 * Parse and sanitize a github-link patch from request body. Accepts:
 *   - `null` -> caller should clear the link
 *   - object with any subset of fields
 * Returns `undefined` if the field is absent from the body (no change to apply),
 * `null` if the caller asked to clear it, or a partial DevIssueGithubLink.
 *
 * Light validation only — we want this to be a flexible base for future
 * automation (webhook ingest) without baking GitHub-specific business rules in.
 */
export function parseGithubPatch(
  raw: unknown
): Partial<DevIssueGithubLink> | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'object') return undefined

  const src = raw as Record<string, unknown>
  const out: Partial<DevIssueGithubLink> = {}

  if ('repo' in src) {
    out.repo = typeof src.repo === 'string' && src.repo.trim() ? src.repo.trim().slice(0, 200) : null
  }
  if ('prNumber' in src) {
    const n = Number(src.prNumber)
    out.prNumber = Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  if ('prUrl' in src) {
    out.prUrl = typeof src.prUrl === 'string' && /^https?:\/\//.test(src.prUrl)
      ? src.prUrl.trim().slice(0, 500)
      : null
  }
  if ('branch' in src) {
    out.branch = typeof src.branch === 'string' && src.branch.trim() ? src.branch.trim().slice(0, 200) : null
  }
  if ('commitSha' in src) {
    out.commitSha = typeof src.commitSha === 'string' && /^[a-f0-9]{7,40}$/i.test(src.commitSha.trim())
      ? src.commitSha.trim().toLowerCase()
      : null
  }
  if ('ciStatus' in src) {
    out.ciStatus =
      typeof src.ciStatus === 'string' && (DEV_CI_STATUSES as readonly string[]).includes(src.ciStatus)
        ? (src.ciStatus as DevCiStatus)
        : null
  }
  if ('mergedAt' in src) {
    if (src.mergedAt === null) out.mergedAt = null
    else if (typeof src.mergedAt === 'string') {
      const d = new Date(src.mergedAt)
      out.mergedAt = Number.isNaN(d.getTime()) ? null : d
    }
  }

  return out
}

/**
 * Merge a patch into a previous link, treating absent fields as unchanged.
 * Used to support partial PATCH semantics without forcing callers to send
 * the whole object every time.
 */
export function mergeGithubLink(
  prev: DevIssueGithubLink | null,
  patch: Partial<DevIssueGithubLink>
): DevIssueGithubLink {
  const base: DevIssueGithubLink = prev ?? {
    repo: null,
    prNumber: null,
    prUrl: null,
    branch: null,
    commitSha: null,
    ciStatus: null,
    mergedAt: null,
  }
  return { ...base, ...patch }
}
