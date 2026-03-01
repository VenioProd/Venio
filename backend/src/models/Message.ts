import mongoose from 'mongoose'
import type { IMessage } from '../types/models.js'

const messageSchema = new mongoose.Schema<IMessage>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

messageSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IMessage>('Message', messageSchema)
