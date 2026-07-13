import type { UserRole } from './enums.js'

export interface JwtPayload {
  id: string
  _id?: string
  role: UserRole
  email: string
  name: string
  sessionVersion?: number
  mfaVerifiedAt?: number
  mfaEnrollmentOnly?: boolean
  impersonatorId?: string
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
  // Express request augmentation uses namespace merging by design.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload
      agentToken?: AgentTokenAttached
      agentUser?: JwtPayload
      requestId?: string
    }
  }
}
