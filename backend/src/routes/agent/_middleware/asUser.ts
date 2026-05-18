import type { Request } from 'express'
import User from '../../../models/User.js'
import type { JwtPayload } from '../../../types/express.js'
import { AgentApiError } from './errors.js'

/**
 * Charge le User AGENT associé au token courant et construit un JwtPayload
 * compatible avec le service `internalMessaging.ts`.
 *
 * Cache par requête : si déjà résolu, retourne `req.agentUser`.
 *
 * Erreurs :
 *   - AGENT_USER_MISSING (500) : token sans User lié (incohérence DB ; tokens
 *     pré-existants avant le backfill, ou User supprimé manuellement).
 *   - AGENT_USER_CORRUPT (500) : User trouvé mais role ≠ AGENT.
 */
export async function loadAgentUserPayload(req: Request): Promise<JwtPayload> {
  if (req.agentUser) return req.agentUser
  const tokenId = req.agentToken?.id
  if (!tokenId) {
    throw new AgentApiError(500, 'NO_TOKEN', 'Token absent du contexte (bug ordre middleware)')
  }
  const user = await User.findOne({ agentTokenId: tokenId, isActive: true })
    .select('_id name email role')
    .lean()
  if (!user) {
    throw new AgentApiError(
      500,
      'AGENT_USER_MISSING',
      'Aucun User AGENT actif associé à ce token — backfill peut-être nécessaire'
    )
  }
  if (user.role !== 'AGENT') {
    throw new AgentApiError(500, 'AGENT_USER_CORRUPT', `User lié a un role inattendu : ${user.role}`)
  }
  const payload: JwtPayload = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: 'AGENT',
  }
  req.agentUser = payload
  return payload
}
