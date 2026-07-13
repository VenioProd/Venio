import crypto from 'node:crypto'
import type { IDevIssue } from '../../models/DevIssue.js'
import type { IDevProject } from '../../models/DevProject.js'

export interface DevAgentTarget {
  agent: string
  model: string
}

export interface DevAgentLaunchAvailability {
  available: boolean
  reason: string | null
  target: DevAgentTarget | null
  limitations: string[]
}

export interface DevAgentRunContext {
  version: 'venio.dev-agent-run.v1'
  project: { id: string; key: string; name: string }
  repository: { fullName: string; baseBranch: string }
  issue: {
    id: string
    identifier: string
    title: string
    description: string
    type: string
    priority: string
    labels: string[]
    acceptanceCriteria: string[]
    subtasks: string[]
    blockedReason: string | null
  }
  recommendation: { id: string; title: string; description: string; source: string } | null
  limits: {
    browserSuppliedSystemPrompt: false
    browserSuppliedShellCommand: false
    browserSuppliedCredentials: false
    permittedRepository: string
    permittedBaseBranch: string
  }
}

export interface DevAgentBridgeDispatch {
  runId: string
  target: DevAgentTarget
  context: DevAgentRunContext
}

export interface DevAgentBridge {
  availability(): DevAgentLaunchAvailability
  dispatch(input: DevAgentBridgeDispatch): Promise<{ bridgeExecutionId: string | null }>
}

const TARGET_PART = /^[a-z0-9][a-z0-9_-]{0,79}$/i
const MODEL_PART = /^[a-z0-9][a-z0-9._:-]{0,159}$/i
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,254}$/

const LIMITATIONS = [
  'Le contexte est construit côté serveur à partir du projet, de l’issue et de la recommandation validée.',
  'Aucun prompt système, commande shell ou credential transmis par le navigateur n’est accepté.',
  'Le dépôt et la branche sont limités à la configuration du projet.',
]

function configuredTarget(): DevAgentTarget | null {
  const raw = process.env.DEV_AGENT_ALLOWED_TARGETS?.trim()
  if (!raw) return null
  for (const candidate of raw.split(',').map((entry) => entry.trim())) {
    const separator = candidate.indexOf(':')
    if (separator <= 0) continue
    const agent = candidate.slice(0, separator).trim()
    const model = candidate.slice(separator + 1).trim()
    if (TARGET_PART.test(agent) && MODEL_PART.test(model)) return { agent, model }
  }
  return null
}

function configuredBridgeUrl(): string | null {
  const raw = process.env.DEV_AGENT_BRIDGE_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const defaultBridge: DevAgentBridge = {
  availability(): DevAgentLaunchAvailability {
    const target = configuredTarget()
    const url = configuredBridgeUrl()
    if (!target) {
      return {
        available: false,
        reason: 'Aucun agent/modèle n’est allowlisté côté serveur.',
        target: null,
        limitations: LIMITATIONS,
      }
    }
    if (!url) {
      return {
        available: false,
        reason: 'Le bridge d’agent n’est pas configuré côté serveur.',
        target,
        limitations: LIMITATIONS,
      }
    }
    return { available: true, reason: null, target, limitations: LIMITATIONS }
  },

  async dispatch(input): Promise<{ bridgeExecutionId: string | null }> {
    const url = configuredBridgeUrl()
    if (!url) throw new Error('BRIDGE_UNAVAILABLE')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    try {
      const token = process.env.DEV_AGENT_BRIDGE_TOKEN?.trim()
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ kind: 'venio.dev-agent-run.v1', ...input }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('BRIDGE_REJECTED')
      const body = (await response.json().catch(() => null)) as { executionId?: unknown } | null
      return { bridgeExecutionId: typeof body?.executionId === 'string' ? body.executionId.slice(0, 200) : null }
    } finally {
      clearTimeout(timeout)
    }
  },
}

let bridgeOverride: DevAgentBridge | null = null

export function getDevAgentBridge(): DevAgentBridge {
  return bridgeOverride ?? defaultBridge
}

/** Test seam: production always uses the configured HTTPS bridge above. */
export function setDevAgentBridgeForTests(bridge: DevAgentBridge | null): void {
  bridgeOverride = bridge
}

export function isValidDevAgentIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY.test(value)
}

export function projectLaunchAvailability(project: Pick<IDevProject, 'github' | 'status'>): DevAgentLaunchAvailability {
  const base = getDevAgentBridge().availability()
  if (!base.available) return base
  if (project.status !== 'ACTIVE') {
    return { ...base, available: false, reason: 'Le projet doit être actif pour lancer un agent.' }
  }
  const github = project.github
  if (!github?.owner || !github.repo || !github.defaultBranch) {
    return {
      ...base,
      available: false,
      reason: 'Le dépôt et la branche par défaut du projet doivent être configurés.',
    }
  }
  return base
}

export function buildDevAgentRunContext(input: {
  project: Pick<IDevProject, '_id' | 'key' | 'name' | 'github'>
  issue: Pick<
    IDevIssue,
    | '_id'
    | 'identifier'
    | 'title'
    | 'description'
    | 'type'
    | 'priority'
    | 'labels'
    | 'acceptanceCriteria'
    | 'subtasks'
    | 'blockedReason'
  >
  recommendation: { id: string; title: string; description: string; source: string } | null
}): DevAgentRunContext {
  const github = input.project.github
  if (!github?.owner || !github.repo || !github.defaultBranch) throw new Error('PROJECT_REPOSITORY_UNCONFIGURED')
  const fullName = `${github.owner}/${github.repo}`
  return {
    version: 'venio.dev-agent-run.v1',
    project: { id: String(input.project._id), key: input.project.key, name: input.project.name },
    repository: { fullName, baseBranch: github.defaultBranch },
    issue: {
      id: String(input.issue._id),
      identifier: input.issue.identifier,
      title: input.issue.title,
      description: input.issue.description.slice(0, 20_000),
      type: input.issue.type,
      priority: input.issue.priority,
      labels: input.issue.labels.slice(0, 16),
      acceptanceCriteria: input.issue.acceptanceCriteria.slice(0, 40),
      subtasks: input.issue.subtasks.slice(0, 80),
      blockedReason: input.issue.blockedReason,
    },
    recommendation: input.recommendation,
    limits: {
      browserSuppliedSystemPrompt: false,
      browserSuppliedShellCommand: false,
      browserSuppliedCredentials: false,
      permittedRepository: fullName,
      permittedBaseBranch: github.defaultBranch,
    },
  }
}

export function launchFingerprint(issueId: string, recommendationId: string | null): string {
  return crypto
    .createHash('sha256')
    .update(`${issueId}:${recommendationId ?? ''}`)
    .digest('hex')
}
