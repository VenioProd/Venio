import mongoose from 'mongoose'
import type { IShareRule, IShareTemplate } from '../types/models/index.js'
import { assertBp } from '../lib/projectFinance/money.js'

export const shareRuleSchema = new mongoose.Schema<IShareRule>(
  {
    beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Beneficiary', required: true },
    bp: {
      type: Number,
      required: true,
      validate: (value: number) => {
        assertBp(value)
        return true
      },
    },
  },
  { _id: false },
)

const shareTemplateSchema = new mongoose.Schema<IShareTemplate>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    rules: { type: [shareRuleSchema], default: [] },
  },
  { timestamps: true },
)

export default mongoose.model<IShareTemplate>('ShareTemplate', shareTemplateSchema)
