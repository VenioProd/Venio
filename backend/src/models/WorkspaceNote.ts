import mongoose from 'mongoose'
import type { IWorkspaceNote } from '../types/models/index.js'

const workspaceNoteSchema = new mongoose.Schema<IWorkspaceNote>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['NOTE', 'POSTIT', 'DRAFT', 'IDEA'], required: true, index: true },
    title: { type: String, default: '' },
    content: { type: String, default: '' },
    color: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    status: { type: String, enum: ['NEW', 'CONVERTED'], default: 'NEW' },
    order: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
)

workspaceNoteSchema.index({ userId: 1, type: 1 })

export default mongoose.model<IWorkspaceNote>('WorkspaceNote', workspaceNoteSchema)
