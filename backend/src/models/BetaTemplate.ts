import mongoose, { Schema, Document } from 'mongoose'
import type { BetaScenarioStep } from './BetaScenario.js'

export interface BetaTemplateScenario {
  title: string
  description: string
  steps: BetaScenarioStep[]
}

export interface IBetaTemplate extends Document {
  _id: mongoose.Types.ObjectId
  name: string
  description: string
  scenarios: BetaTemplateScenario[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const stepSchema = new Schema<BetaScenarioStep>(
  {
    order: { type: Number, required: true, min: 1 },
    instruction: { type: String, required: true, trim: true, maxlength: 500 },
    expected: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
)

const betaTemplateSchema = new Schema<IBetaTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160, unique: true },
    description: { type: String, default: '', maxlength: 2000 },
    scenarios: {
      type: [
        new Schema<BetaTemplateScenario>(
          {
            title: { type: String, required: true, trim: true, maxlength: 200 },
            description: { type: String, default: '', maxlength: 10000 },
            steps: { type: [stepSchema], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

export default mongoose.model<IBetaTemplate>('BetaTemplate', betaTemplateSchema)
