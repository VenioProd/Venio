/**
 * Types et helpers partagés pour les composants de la page Agent API.
 * Cf. docs/api-agent.md pour la spec complète.
 */

export interface UserRef {
  _id: string
  email?: string
  name?: string
}

export interface AgentToken {
  _id: string
  name: string
  prefix: string
  scopes: string[]
  rateLimitPerMin: number
  status: 'ACTIVE' | 'REVOKED'
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp?: string
  totalRequests: number
  totalMutations: number
  createdBy: UserRef | null
  revokedBy: UserRef | null
  revokedAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AgentAuthLogEvent {
  _id: string
  action: 'AGENT_AUTH_SUCCESS' | 'AGENT_AUTH_FAIL'
  ip?: string
  userAgent?: string
  metadata?: {
    reason?: string
    path?: string
    method?: string
    tokenName?: string
    tokenPrefix?: string
  }
  createdAt: string
}

export interface ScopesCatalog {
  scopes: string[]
  adminWildcard: string
}

export interface FormState {
  name: string
  scopes: string[]
  rateLimitPerMin: number
  expiresAt: string
  notes: string
}

export const emptyForm: FormState = {
  name: '',
  scopes: [],
  rateLimitPerMin: 120,
  expiresAt: '',
  notes: '',
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}
