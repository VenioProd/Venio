import mongoose from 'mongoose'
import type { IPersonalTask } from '../types/models/index.js'

const personalTaskSchema = new mongoose.Schema<IPersonalTask>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['A_FAIRE', 'EN_COURS', 'TERMINE'], default: 'A_FAIRE' },
    priority: { type: String, enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'], default: 'NORMALE' },
    dueDate: { type: Date, default: null },
    order: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
    sourceIdeaId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkspaceNote', default: null },
  },
  { timestamps: true }
)

personalTaskSchema.index({ userId: 1, status: 1 })

export default mongoose.model<IPersonalTask>('PersonalTask', personalTaskSchema)
