import mongoose from 'mongoose'
import type { IInternalMessage } from '../types/models/index.js'

const attachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { _id: false }
)

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true, trim: true },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
)

const internalMessageSchema = new mongoose.Schema<IInternalMessage>(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalConversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attachments: { type: [attachmentSchema], default: [] },
    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalMessage', default: null, index: true },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

internalMessageSchema.index({ conversation: 1, createdAt: -1 })
internalMessageSchema.index({ conversation: 1, parentMessage: 1, createdAt: 1 })
internalMessageSchema.index({ content: 'text' })

export default mongoose.model<IInternalMessage>('InternalMessage', internalMessageSchema)
