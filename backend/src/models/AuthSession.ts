import crypto from 'crypto'
import mongoose, { type Types } from 'mongoose'

export interface IAuthSession {
  userId: Types.ObjectId
  tokenHash: string
  sessionVersion: number
  expiresAt: Date
  revokedAt: Date | null
  impersonatorId: Types.ObjectId | null
  mfaVerifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const authSessionSchema = new mongoose.Schema<IAuthSession>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // The browser receives only the opaque random value. A database leak cannot
    // be used to replay a session because only its SHA-256 digest is persisted.
    tokenHash: { type: String, required: true, unique: true, index: true },
    // Captured when the opaque browser session is issued. This lets us reject
    // sessions created before a credentials or authorization change even if a
    // bulk revocation was interrupted or raced with session creation.
    sessionVersion: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null, index: true },
    impersonatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    mfaVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export default mongoose.model<IAuthSession>('AuthSession', authSessionSchema)
