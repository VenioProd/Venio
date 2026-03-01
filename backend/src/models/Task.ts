import mongoose from 'mongoose'
import type { ITask } from '../types/models.js'

const taskSchema = new mongoose.Schema<ITask>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE'],
      default: 'A_FAIRE',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
    tags: [{ type: String, trim: true }],
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

taskSchema.index({ project: 1, status: 1 })
taskSchema.index({ project: 1, assignee: 1 })

export default mongoose.model<ITask>('Task', taskSchema)
