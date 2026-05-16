import type { UserRole } from './enums.js'
import type { IAgentToken } from './models/agent.js'

export interface JwtPayload {
  id: string
  _id?: string
  role: UserRole
  email: string
  name: string
  iat?: number
  exp?: number
}

/**
 * Subset des champs AgentToken attachés à req.agentToken par le middleware
 * agent/auth. On ne propage jamais le tokenHash.
 */
export interface AgentTokenAttached {
  id: string
  name: string
  prefix: string
  scopes: string[]
  rateLimitPerMin: number
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
      agentToken?: AgentTokenAttached
      requestId?: string
    }
  }
}
