import type { UserRole } from './enums.js'

export interface JwtPayload {
  id: string
  _id?: string
  role: UserRole
  email: string
  name: string
  iat?: number
  exp?: number
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}
