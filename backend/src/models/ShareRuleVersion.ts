import mongoose from 'mongoose'
import type { IShareRuleVersion } from '../types/models/index.js'
import { shareRuleSchema } from './ShareTemplate.js'

const shareRuleVersionSchema = new mongoose.Schema<IShareRuleVersion>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    effectiveFrom: { type: Date, required: true },
    rules: { type: [shareRuleSchema], default: [] },
    reason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
shareRuleVersionSchema.index({ project: 1, version: 1 }, { unique: true })
shareRuleVersionSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Une version de règles est immuable')
})
shareRuleVersionSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'],
  function () {
    throw new Error('Une version de règles est immuable')
  },
)

export default mongoose.model<IShareRuleVersion>('ShareRuleVersion', shareRuleVersionSchema)
