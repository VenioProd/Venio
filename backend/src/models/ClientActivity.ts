import mongoose from 'mongoose'
import type { IClientActivity } from '../types/models.js'

const clientActivitySchema = new mongoose.Schema<IClientActivity>(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

clientActivitySchema.index({ clientId: 1, createdAt: -1 })

export default mongoose.model<IClientActivity>('ClientActivity', clientActivitySchema)
