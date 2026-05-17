import mongoose from 'mongoose'
import type { IInternalConversationMember } from '../types/models/index.js'

const internalConversationMemberSchema = new mongoose.Schema<IInternalConversationMember>(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalConversation', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['OWNER', 'MEMBER'], default: 'MEMBER' },
    muted: { type: Boolean, default: false },
    lastReadAt: { type: Date, default: null },
  },
  { timestamps: true }
)

internalConversationMemberSchema.index({ conversation: 1, user: 1 }, { unique: true })
internalConversationMemberSchema.index({ user: 1, updatedAt: -1 })

export default mongoose.model<IInternalConversationMember>('InternalConversationMember', internalConversationMemberSchema)
