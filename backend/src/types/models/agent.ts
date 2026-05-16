import type { Document, Types } from 'mongoose'
import type { AgentTokenStatus } from '../enums.js'

/**
 * AgentToken : Personal Access Token (PAT) utilisé par les agents externes
 * (Kuro, intégrations tierces) pour piloter Venio via /api/v1/agent/*.
 *
 * Auth : Bearer `vno_pat_<32 chars base62>`. Le secret est généré par le
 * serveur à la création et affiché UNE SEULE FOIS. Il est stocké en base
 * sous forme :
 *   - prefix    : "vno_pat_" + 4 chars discriminants (12 chars en clair)
 *                 → permet le lookup rapide et l'affichage dans l'UI
 *   - tokenHash : bcrypt(secret)  → seule donnée vérifiable
 *
 * Le token est INDÉPENDANT de tout user (modèle PAT à la GitHub). Les
 * permissions sont définies par le tableau `scopes` (pas par un rôle user).
 */
export interface IAgentToken extends Document {
  name: string
  prefix: string
  tokenHash: string
  scopes: string[]
  rateLimitPerMin: number
  status: AgentTokenStatus
  expiresAt: Date | null
  lastUsedAt: Date | null
  lastUsedIp: string
  lastUsedUserAgent: string
  totalRequests: number
  totalMutations: number
  createdBy: Types.ObjectId | null
  revokedAt: Date | null
  revokedBy: Types.ObjectId | null
  notes: string
  createdAt: Date
  updatedAt: Date
}

/**
 * AgentIdempotencyKey : enregistrement persistant des réponses pour les
 * mutations (POST/PATCH/DELETE) afin de garantir l'idempotency.
 *
 * Index unique sur (tokenId, key). TTL Mongo natif via `createdAt` +
 * `expireAfterSeconds: 86400` (24h).
 */
export interface IAgentIdempotencyKey extends Document {
  tokenId: Types.ObjectId
  key: string
  method: string
  path: string
  requestHash: string
  responseStatus: number
  responseBody: unknown
  createdAt: Date
}
