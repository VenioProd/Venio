import mongoose from 'mongoose'
import type { IShareAllocation } from '../types/models/index.js'

const shareAllocationSchema = new mongoose.Schema<IShareAllocation>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectPayment', required: true },
    beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Beneficiary', default: null },
    amountCents: { type: Number, required: true, validate: Number.isSafeInteger },
    bp: {
      type: Number,
      default: null,
      min: 0,
      max: 10000,
      validate: (value: number | null) => value === null || Number.isSafeInteger(value),
    },
    ruleVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ShareRuleVersion', default: null },
  },
  { timestamps: true },
)
shareAllocationSchema.index({ payment: 1, beneficiary: 1 }, { unique: true })
shareAllocationSchema.index({ project: 1, beneficiary: 1 })
shareAllocationSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Une part est immuable')
})
shareAllocationSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'],
  function () {
    throw new Error('Une part est immuable')
  },
)

export default mongoose.model<IShareAllocation>('ShareAllocation', shareAllocationSchema)
