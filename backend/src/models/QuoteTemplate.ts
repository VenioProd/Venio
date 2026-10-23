import mongoose from 'mongoose'
import { questionSchema, lineSchema } from './QuoteProposal.js'

const quoteTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    intro: { type: String, default: '' },
    questions: { type: [questionSchema], default: [] },
    lines: { type: [lineSchema], default: [] },
    validityDays: { type: Number, default: 30, min: 1 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

export default mongoose.model('QuoteTemplate', quoteTemplateSchema)
