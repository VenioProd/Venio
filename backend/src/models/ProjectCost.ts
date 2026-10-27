import mongoose from 'mongoose'
import type { IProjectCost } from '../types/models/index.js'

const projectCostSchema = new mongoose.Schema<IProjectCost>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    accountCode: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    supplier: { type: String, required: true, trim: true },
    htCents: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    vatCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    date: { type: Date, required: true },
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingEntry', required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
projectCostSchema.index({ idempotencyKey: 1 }, { unique: true })
projectCostSchema.index({ project: 1, date: 1 })
projectCostSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Un coût est immuable')
})
projectCostSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'], function () {
  throw new Error('Un coût est immuable')
})

export default mongoose.model<IProjectCost>('ProjectCost', projectCostSchema)
