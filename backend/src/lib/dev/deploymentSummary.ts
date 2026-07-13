import mongoose from 'mongoose'
import DevIssue, { DEV_CI_STATUSES, type DevCiStatus } from '../../models/DevIssue.js'
import DevIssueEvent from '../../models/DevIssueEvent.js'
import type { DevProjectGithubConfig } from '../../models/DevProject.js'

export type DeploymentObservationSource = 'timeline_deployment' | 'timeline_ci' | 'issue_github' | 'unavailable'
export type DeploymentRunStatus = 'success' | 'failed' | 'running' | 'unknown'
export type DeploymentHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
export type DeploymentFreshness = 'fresh' | 'stale' | 'unknown'

export interface DeploymentCommitSummary {
  sha: string | null
  observedAt: string | null
  source: DeploymentObservationSource
  url: string | null
}

export interface DeploymentCiSummary {
  status: DevCiStatus | null
  observedAt: string | null
  source: DeploymentObservationSource
  runUrl: string | null
}

export interface DeploymentRunSummary {
  status: DeploymentRunStatus
  observedAt: string | null
  source: DeploymentObservationSource
  logsUrl: string | null
}

export interface DeploymentHealthSummary {
  status: DeploymentHealthStatus
  observedAt: string | null
  source: DeploymentObservationSource
}

export interface DevDeploymentSummary {
  configured: boolean
  reason: string | null
  productionCommit: DeploymentCommitSummary
  ci: DeploymentCiSummary
  deployment: DeploymentRunSummary
  healthcheck: DeploymentHealthSummary
  observedAt: string | null
  freshness: DeploymentFreshness
  freshnessThresholdHours: number
}

const GITHUB_PART = /^[A-Za-z0-9_.-]+$/
const SHA = /^[a-f0-9]{7,40}$/i
const FRESHNESS_MS = 24 * 60 * 60 * 1000

type Metadata = Record<string, unknown>
type TechnicalEvent = {
  metadata: Metadata
  createdAt: Date
}

function record(value: unknown): Metadata | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Metadata) : null
}

function validSha(value: unknown): string | null {
  return typeof value === 'string' && SHA.test(value.trim()) ? value.trim().toLowerCase() : null
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

/**
 * Event metadata is deliberately treated as untrusted input. URLs are never
 * copied out of it: GitHub run/commit links are reconstructed from the
 * project-owned owner/repo configuration and a strictly validated identifier.
 */
function githubLinks(github: DevProjectGithubConfig | null): {
  configured: boolean
  commitUrl: (sha: string | null) => string | null
  runUrl: (runId: unknown) => string | null
} {
  const owner = github?.owner?.trim() ?? ''
  const repo = github?.repo?.trim() ?? ''
  const configured = GITHUB_PART.test(owner) && GITHUB_PART.test(repo)
  const base = configured ? `https://github.com/${owner}/${repo}` : null
  return {
    configured,
    commitUrl: (sha) => (base && sha ? `${base}/commit/${sha}` : null),
    runUrl: (runId) =>
      base && typeof runId === 'number' && Number.isSafeInteger(runId) && runId > 0
        ? `${base}/actions/runs/${runId}`
        : null,
  }
}

function production(metadata: Metadata): boolean {
  const environment = typeof metadata.environment === 'string' ? metadata.environment.trim().toLowerCase() : ''
  return environment === 'production' || environment === 'prod'
}

function ciStatus(metadata: Metadata): DevCiStatus | null {
  const github = record(metadata.github)
  const value = metadata.ciStatus ?? github?.ciStatus
  return typeof value === 'string' && (DEV_CI_STATUSES as readonly string[]).includes(value)
    ? (value as DevCiStatus)
    : null
}

function deploymentStatus(metadata: Metadata): DeploymentRunStatus {
  const value = typeof metadata.status === 'string' ? metadata.status.trim().toLowerCase() : ''
  if (['success', 'succeeded', 'completed'].includes(value)) return 'success'
  if (['failure', 'failed', 'error'].includes(value)) return 'failed'
  if (['pending', 'running', 'in_progress'].includes(value)) return 'running'
  return 'unknown'
}

function healthcheck(metadata: Metadata): { status: DeploymentHealthStatus; checkedAt: Date | null } {
  const value = record(metadata.healthcheck)
  const raw = typeof value?.status === 'string' ? value.status.trim().toLowerCase() : ''
  const status: DeploymentHealthStatus = ['healthy', 'degraded', 'unhealthy'].includes(raw)
    ? (raw as DeploymentHealthStatus)
    : 'unknown'
  const checkedAt = typeof value?.checkedAt === 'string' ? new Date(value.checkedAt) : null
  return { status, checkedAt: checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt : null }
}

function eventCommit(event: TechnicalEvent): string | null {
  const github = record(event.metadata.github)
  return validSha(event.metadata.commitSha) || validSha(github?.commitSha)
}

function eventRunId(event: TechnicalEvent): unknown {
  const github = record(event.metadata.github)
  return event.metadata.runId ?? github?.runId
}

/**
 * Builds a source-first production deployment view from persisted technical
 * timeline events. It intentionally performs no external request: absent
 * webhook/event data remains unknown rather than being inferred as healthy.
 */
export async function computeProjectDeploymentSummary(input: {
  _id: mongoose.Types.ObjectId
  github: DevProjectGithubConfig | null
}): Promise<DevDeploymentSummary> {
  const links = githubLinks(input.github)
  const [deploymentsRaw, ciEventsRaw, issueCi] = await Promise.all([
    DevIssueEvent.find({ project: input._id, type: 'deployed' }).sort({ createdAt: -1 }).limit(50).lean(),
    DevIssueEvent.find({ project: input._id, type: 'ci_changed' }).sort({ createdAt: -1 }).limit(50).lean(),
    DevIssue.find({ project: input._id, 'github.ciStatus': { $ne: null } })
      .select('github updatedAt')
      .sort({ updatedAt: -1 })
      .limit(1)
      .lean(),
  ])

  const productionDeployment =
    (deploymentsRaw as unknown as TechnicalEvent[]).find((event) => production(event.metadata)) ?? null
  const latestCiEvent =
    (ciEventsRaw as unknown as TechnicalEvent[]).find((event) => ciStatus(event.metadata) !== null) ?? null
  const productionSha = productionDeployment ? eventCommit(productionDeployment) : null
  const health = productionDeployment ? healthcheck(productionDeployment.metadata) : null
  const deploymentAt = iso(productionDeployment?.createdAt)
  const ciEventAt = iso(latestCiEvent?.createdAt)
  const issueCiStatus = issueCi[0]?.github?.ciStatus ?? null
  const issueCiAt = issueCi[0] ? iso(issueCi[0].updatedAt) : null
  const ciAt = ciEventAt ?? issueCiAt
  const observedAt =
    [deploymentAt, ciAt, health?.checkedAt ? iso(health.checkedAt) : null]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  const age = observedAt ? Date.now() - new Date(observedAt).getTime() : null

  return {
    configured: links.configured,
    reason: links.configured
      ? null
      : 'GitHub owner/repo non configuré : les liens vers commits et runs ne peuvent pas être générés en sécurité.',
    productionCommit: {
      sha: productionSha,
      observedAt: deploymentAt,
      source: productionDeployment ? 'timeline_deployment' : 'unavailable',
      url: links.commitUrl(productionSha),
    },
    ci: {
      status: latestCiEvent ? ciStatus(latestCiEvent.metadata) : issueCiStatus,
      observedAt: ciAt,
      source: latestCiEvent ? 'timeline_ci' : issueCiStatus ? 'issue_github' : 'unavailable',
      runUrl: latestCiEvent ? links.runUrl(eventRunId(latestCiEvent)) : null,
    },
    deployment: {
      status: productionDeployment ? deploymentStatus(productionDeployment.metadata) : 'unknown',
      observedAt: deploymentAt,
      source: productionDeployment ? 'timeline_deployment' : 'unavailable',
      logsUrl: productionDeployment ? links.runUrl(eventRunId(productionDeployment)) : null,
    },
    healthcheck: {
      status: health?.status ?? 'unknown',
      observedAt: health?.status !== 'unknown' && health?.checkedAt ? iso(health.checkedAt) : null,
      source: health?.status !== 'unknown' ? 'timeline_deployment' : 'unavailable',
    },
    observedAt,
    freshness: age === null || Number.isNaN(age) ? 'unknown' : age <= FRESHNESS_MS ? 'fresh' : 'stale',
    freshnessThresholdHours: 24,
  }
}
