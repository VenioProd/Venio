import mongoose from 'mongoose'
import type { IProjectMember } from '../types/models/index.js'

/**
 * An explicit, revocable client-side collaboration grant.
 *
 * The project client remains the implicit owner and is deliberately not copied
 * into this collection. This keeps ownership separate from collaborator roles.
 */
const projectMemberSchema = new mongoose.Schema<IProjectMember>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['VIEWER', 'EDITOR'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

projectMemberSchema.index({ project: 1, user: 1 }, { unique: true })
projectMemberSchema.index({ user: 1, project: 1 })

export default mongoose.model<IProjectMember>('ProjectMember', projectMemberSchema)
