import express, { type Express } from 'express'
import AgentToken from '../../models/AgentToken.js'
import { generateAgentToken } from '../../lib/agent/tokens.js'

/**
 * Crée une instance Express minimale pour tester les routes agent contre
 * une vraie base Mongo (mongo-memory-server). À utiliser combiné avec
 * mongoTestEnv.ts.
 *
 * On monte directement le router /api/v1/agent en réutilisant tout son
 * pipeline (auth Bearer + scopes + idempotency + audit).
 *
 * Le helper createAgentToken() crée un token actif en base et retourne
 * son secret en clair pour l'utiliser dans les headers Authorization.
 */

export async function createTestApp(): Promise<Express> {
  // Import dynamique pour s'assurer que les modèles soient déjà connectés
  // à la Mongo en mémoire au moment du import.
  const { default: agentRoutes } = await import('../../routes/agent/index.js')
  const app = express()
  // Limite identique à celle de prod (cf. index.ts) pour accepter les
  // uploads base64 jusqu'à ~5 Mo.
  app.use('/api/v1/agent', express.json({ limit: '8mb' }), agentRoutes)
  return app
}

export interface SeededToken {
  id: string
  plainSecret: string
  prefix: string
}

/**
 * Crée un AgentToken actif avec les scopes demandés et retourne le secret
 * en clair pour `Authorization: Bearer ${plainSecret}`.
 */
export async function createAgentTokenInDb(scopes: string[]): Promise<SeededToken> {
  const generated = await generateAgentToken()
  const token = await AgentToken.create({
    name: `test-token-${Date.now()}`,
    prefix: generated.prefix,
    tokenHash: generated.hash,
    scopes,
    rateLimitPerMin: 10000, // gros quota pour ne pas bloquer les tests
  })
  return { id: String(token._id), plainSecret: generated.plain, prefix: generated.prefix }
}

/**
 * Construit l'objet de headers communs : Authorization, Idempotency-Key
 * (UUID v4-like), Content-Type.
 */
export function authHeaders(plainSecret: string, options: { idempotencyKey?: string } = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${plainSecret}`,
    'Content-Type': 'application/json',
  }
  if (options.idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }
  return headers
}

/**
 * Génère un identifiant d'idempotency unique par test.
 */
let idempotencyCounter = 0
export function uniqueIdempotencyKey(): string {
  idempotencyCounter += 1
  return `test-idempotency-${Date.now()}-${idempotencyCounter}`
}
