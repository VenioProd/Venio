import mongoose from 'mongoose'
import type { ILeadActivity } from '../types/models.js'

const leadActivitySchema = new mongoose.Schema<ILeadActivity>(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    type: { type: String, required: true, trim: true }, // STATUS_CHANGE, ASSIGNED, CREATED, AUTO_QUALIFIED, etc.
    label: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

leadActivitySchema.index({ leadId: 1, createdAt: -1 })

export default mongoose.model<ILeadActivity>('LeadActivity', leadActivitySchema)
