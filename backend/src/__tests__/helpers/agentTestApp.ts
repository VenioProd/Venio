import express, { type Express } from 'express'
import AgentToken from '../../models/AgentToken.js'
import { generateAgentToken } from '../../lib/agent/tokens.js'
import { requestIdMiddleware } from '../../routes/agent/_middleware/errors.js'
import { agentJsonBodyParser } from '../../routes/agent/_middleware/jsonBody.js'

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
  // Même chaîne de parsing que la production : les tests de contrat couvrent
  // ainsi aussi les erreurs JSON 400/413 normalisées par l'API agent.
  app.use('/api/v1/agent', requestIdMiddleware, agentJsonBodyParser, agentRoutes)
  return app
}

/**
 * Crée une instance Express minimale pour tester les routes admin.
 * Monte /api/admin/agent-tokens avec auth JWT + requireAdmin.
 */
export async function createAdminTestApp(): Promise<Express> {
  const { default: adminAgentTokenRoutes } = await import('../../routes/admin/agentTokens.js')
  const app = express()
  app.use('/api/admin/agent-tokens', express.json(), adminAgentTokenRoutes)
  return app
}

/**
 * Retourne directement le router agent (pour les tests d'introspection
 * comme la synchronisation OpenAPI ↔ router).
 */
export async function getAgentRouter(): Promise<express.Router> {
  const { default: agentRoutes } = await import('../../routes/agent/index.js')
  return agentRoutes
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
