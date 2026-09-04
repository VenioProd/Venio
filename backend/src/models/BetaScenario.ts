import mongoose, { Schema, Document } from 'mongoose'

export const BETA_SCENARIO_STATUSES = ['NOT_TESTED', 'OK', 'KO', 'TO_OPTIMIZE', 'TO_RETEST'] as const
export type BetaScenarioStatus = (typeof BETA_SCENARIO_STATUSES)[number]

export interface BetaScenarioStep {
  order: number
  instruction: string
  expected: string
}

export interface IBetaScenario extends Document {
  _id: mongoose.Types.ObjectId
  campaign: mongoose.Types.ObjectId
  number: number
  identifier: string
  title: string
  description: string
  steps: BetaScenarioStep[]
  rank: number
  summaryStatus: BetaScenarioStatus
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const betaScenarioSchema = new Schema<IBetaScenario>(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'BetaCampaign', required: true, index: true },
    number: { type: Number, required: true },
    identifier: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 10000 },
    steps: {
      type: [
        new Schema<BetaScenarioStep>(
          {
            order: { type: Number, required: true, min: 1 },
            instruction: { type: String, required: true, trim: true, maxlength: 500 },
            expected: { type: String, default: '', trim: true, maxlength: 500 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    rank: { type: Number, default: 0 },
    summaryStatus: { type: String, enum: BETA_SCENARIO_STATUSES, default: 'NOT_TESTED', index: true },
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
)

betaScenarioSchema.index({ campaign: 1, number: 1 }, { unique: true })
betaScenarioSchema.index({ campaign: 1, rank: 1 })

export default mongoose.model<IBetaScenario>('BetaScenario', betaScenarioSchema)
