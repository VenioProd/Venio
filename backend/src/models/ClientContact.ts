import mongoose from 'mongoose'
import type { IClientContact } from '../types/models.js'

const clientContactSchema = new mongoose.Schema<IClientContact>(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    role: { type: String, default: '', trim: true },
    isMain: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
)

clientContactSchema.index({ clientId: 1, isMain: -1, updatedAt: -1 })

export default mongoose.model<IClientContact>('ClientContact', clientContactSchema)
