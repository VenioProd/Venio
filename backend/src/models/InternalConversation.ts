import mongoose from 'mongoose'
import type { IInternalConversation } from '../types/models/index.js'

const internalConversationSchema = new mongoose.Schema<IInternalConversation>(
  {
    type: { type: String, enum: ['CHANNEL', 'DM', 'GROUP'], required: true, index: true },
    name: { type: String, trim: true, default: '' },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      required(this: IInternalConversation) {
        return this.type === 'CHANNEL'
      },
    },
    visibility: { type: String, enum: ['PUBLIC', 'PRIVATE'], default: 'PRIVATE', index: true },
    memberKey: { type: String, default: '', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isArchived: { type: Boolean, default: false, index: true },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true }
)

internalConversationSchema.index({ slug: 1 }, { unique: true, sparse: true })
internalConversationSchema.index({ type: 1, memberKey: 1 }, { unique: true, sparse: true })
internalConversationSchema.index({ isArchived: 1, lastMessageAt: -1, updatedAt: -1 })

export default mongoose.model<IInternalConversation>('InternalConversation', internalConversationSchema)
