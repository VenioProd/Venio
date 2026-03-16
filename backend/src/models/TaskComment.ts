import mongoose from 'mongoose'
import type { ITaskComment } from '../types/models/index.js'

const taskCommentSchema = new mongoose.Schema<ITaskComment>(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

taskCommentSchema.index({ task: 1, createdAt: 1 })

export default mongoose.model<ITaskComment>('TaskComment', taskCommentSchema)
