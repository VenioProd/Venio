import mongoose from 'mongoose'
import DevIssue, { type DevCiStatus, type DevIssueGithubLink } from '../../models/DevIssue.js'
import type { DevProjectGithubConfig } from '../../models/DevProject.js'

export interface GithubRepoLinks {
  repoUrl: string | null
  prsUrl: string | null
  commitsUrl: string | null
  actionsUrl: string | null
  branchesUrl: string | null
  issuesUrl: string | null
}

export interface GithubPullRequestRef {
  issueId: string
  identifier: string
  title: string
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  ciStatus: DevCiStatus | null
  mergedAt: string | null
  repo: string | null
}

export interface DevGithubSummary {
  configured: boolean
  owner: string | null
  repo: string | null
  defaultBranch: string | null
  htmlUrl: string | null
  repoPath: string | null
  links: GithubRepoLinks
  pullRequests: {
    open: GithubPullRequestRef[]
    merged: GithubPullRequestRef[]
    failing: GithubPullRequestRef[]
    counts: { open: number; merged: number; failing: number }
  }
  reason?: string
}

const FULL_REPO_REGEX = /^[\w.-]+\/[\w.-]+$/

/**
 * Derive a canonical owner/repo pair from arbitrary project config. Supports:
 *   - explicit { owner, repo }
 *   - "owner/repo" string in htmlUrl/repo
 *   - full HTTPS URL "https://github.com/owner/repo[.git]"
 */
function deriveOwnerRepo(github: DevProjectGithubConfig | null | undefined): { owner: string | null; repo: string | null } {
  if (!github) return { owner: null, repo: null }
  if (github.owner && github.repo) return { owner: github.owner.trim(), repo: github.repo.trim() }
  const htmlUrl = github.htmlUrl?.trim()
  if (htmlUrl) {
    try {
      const url = new URL(htmlUrl)
      if (url.hostname.endsWith('github.com')) {
        const [, owner, repoRaw] = url.pathname.split('/')
        if (owner && repoRaw) return { owner, repo: repoRaw.replace(/\.git$/i, '') }
      }
    } catch {/* ignore */}
  }
  // Some projects may have packed owner/repo into github.repo (e.g. "venio/app")
  if (github.repo && FULL_REPO_REGEX.test(github.repo)) {
    const [owner, repo] = github.repo.split('/')
    return { owner, repo }
  }
  return { owner: null, repo: null }
}

export function buildRepoLinks(github: DevProjectGithubConfig | null | undefined): GithubRepoLinks {
  const { owner, repo } = deriveOwnerRepo(github)
  const branch = github?.defaultBranch?.trim() || null
  if (!owner || !repo) {
    return {
      repoUrl: github?.htmlUrl?.trim() || null,
      prsUrl: null,
      commitsUrl: null,
      actionsUrl: null,
      branchesUrl: null,
      issuesUrl: null,
    }
  }
  const base = `https://github.com/${owner}/${repo}`
  return {
    repoUrl: base,
    prsUrl: `${base}/pulls?q=is%3Apr+is%3Aopen`,
    commitsUrl: branch ? `${base}/commits/${branch}` : `${base}/commits`,
    actionsUrl: `${base}/actions`,
    branchesUrl: `${base}/branches`,
    issuesUrl: `${base}/issues`,
  }
}

interface RawIssue {
  _id: mongoose.Types.ObjectId
  identifier: string
  title: string
  github: DevIssueGithubLink | null
}

function shapePr(issue: RawIssue): GithubPullRequestRef | null {
  if (!issue.github || (!issue.github.prNumber && !issue.github.prUrl)) return null
  return {
    issueId: String(issue._id),
    identifier: issue.identifier,
    title: issue.title,
    prNumber: issue.github.prNumber ?? null,
    prUrl: issue.github.prUrl,
    branch: issue.github.branch,
    ciStatus: issue.github.ciStatus,
    mergedAt: issue.github.mergedAt ? new Date(issue.github.mergedAt).toISOString() : null,
    repo: issue.github.repo,
  }
}

export async function computeProjectGithubSummary(
  project: { _id: mongoose.Types.ObjectId; github: DevProjectGithubConfig | null }
): Promise<DevGithubSummary> {
  const links = buildRepoLinks(project.github)
  const { owner, repo } = deriveOwnerRepo(project.github)
  const configured = Boolean(owner && repo) || Boolean(project.github?.htmlUrl)

  const issuesWithLink = (await DevIssue.find({
    project: project._id,
    'github.prNumber': { $ne: null },
  })
    .select('_id identifier title github')
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean()) as unknown as RawIssue[]

  const prs = issuesWithLink.map(shapePr).filter((p): p is GithubPullRequestRef => p !== null)
  const merged = prs.filter((p) => Boolean(p.mergedAt))
  const open = prs.filter((p) => !p.mergedAt)
  const failing = open.filter((p) => p.ciStatus === 'FAILURE')

  return {
    configured,
    owner: owner || project.github?.owner || null,
    repo: repo || project.github?.repo || null,
    defaultBranch: project.github?.defaultBranch || null,
    htmlUrl: links.repoUrl,
    repoPath: project.github?.repoPath || null,
    links,
    pullRequests: {
      open,
      merged: merged.slice(0, 8),
      failing,
      counts: { open: open.length, merged: merged.length, failing: failing.length },
    },
    reason: configured
      ? undefined
      : 'GitHub non configuré pour ce projet. Renseignez owner/repo (et idéalement repoPath) pour activer les liens et les métriques code.',
  }
}
