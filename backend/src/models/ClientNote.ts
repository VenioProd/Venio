import mongoose from 'mongoose'
import type { IClientNote } from '../types/models.js'

const clientNoteSchema = new mongoose.Schema<IClientNote>(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: {
      type: String,
      enum: ['INTERNE'],
      default: 'INTERNE',
    },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
)

clientNoteSchema.index({ clientId: 1, pinned: -1, createdAt: -1 })

export default mongoose.model<IClientNote>('ClientNote', clientNoteSchema)
