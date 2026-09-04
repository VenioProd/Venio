import mongoose, { Schema, Document } from 'mongoose'

export const BETA_CAMPAIGN_STATUSES = ['DRAFT', 'RUNNING', 'CLOSED'] as const
export type BetaCampaignStatus = (typeof BETA_CAMPAIGN_STATUSES)[number]

export interface IBetaCampaign extends Document {
  _id: mongoose.Types.ObjectId
  devProject: mongoose.Types.ObjectId
  name: string
  description: string
  targetUrl: string | null
  status: BetaCampaignStatus
  startsAt: Date | null
  endsAt: Date | null
  createdBy: mongoose.Types.ObjectId
  // Borne haute servant à allouer le numéro de démarche sans collision,
  // même patron que DevProject.issueCounter.
  scenarioCounter: number
  createdAt: Date
  updatedAt: Date
}

const betaCampaignSchema = new Schema<IBetaCampaign>(
  {
    devProject: { type: Schema.Types.ObjectId, ref: 'DevProject', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 5000 },
    targetUrl: { type: String, default: null, trim: true, maxlength: 500 },
    status: { type: String, enum: BETA_CAMPAIGN_STATUSES, default: 'DRAFT', index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scenarioCounter: { type: Number, default: 0 },
  },
  { timestamps: true },
)

betaCampaignSchema.index({ status: 1, updatedAt: -1 })
betaCampaignSchema.index({ devProject: 1, status: 1 })

export default mongoose.model<IBetaCampaign>('BetaCampaign', betaCampaignSchema)
