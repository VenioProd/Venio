import mongoose from 'mongoose'
import type { IProjectInvitation } from '../types/models/index.js'

/**
 * A single-use bearer invitation for a client project.
 *
 * tokenHash is deliberately the only persisted representation of the secret:
 * the opaque token is returned once when the invitation is created and is
 * never recoverable from this collection afterwards.
 */
const projectInvitationSchema = new mongoose.Schema<IProjectInvitation>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    role: { type: String, enum: ['VIEWER', 'EDITOR'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    usedAt: { type: Date, default: null, index: true },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

projectInvitationSchema.index({ project: 1, createdAt: -1 })
projectInvitationSchema.index({ project: 1, revokedAt: 1, usedAt: 1, expiresAt: 1 })

export default mongoose.model<IProjectInvitation>('ProjectInvitation', projectInvitationSchema)
