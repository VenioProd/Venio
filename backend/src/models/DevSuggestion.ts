import mongoose, { Schema, Document } from 'mongoose'

export const DEV_SUGGESTION_STATUSES = ['NEW', 'STUDIED', 'ACCEPTED', 'REJECTED'] as const
export type DevSuggestionStatus = (typeof DEV_SUGGESTION_STATUSES)[number]

export const DEV_SUGGESTION_IMPACT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type DevSuggestionImpactLevel = (typeof DEV_SUGGESTION_IMPACT_LEVELS)[number]

export const DEV_SUGGESTION_LINK_KINDS = ['lead', 'client'] as const

export interface DevSuggestionStatusEntry {
  status: DevSuggestionStatus
  by: mongoose.Types.ObjectId | null
  at: Date
  note: string
}

export interface IDevSuggestion extends Document {
  _id: mongoose.Types.ObjectId
  title: string
  problem: string
  project: mongoose.Types.ObjectId | null
  link: { kind: 'lead' | 'client'; ref: mongoose.Types.ObjectId } | null
  requester: { user: mongoose.Types.ObjectId | null; name: string }
  impact: { amountEur: number | null; level: DevSuggestionImpactLevel }
  status: DevSuggestionStatus
  rejectionReason: string | null
  voters: mongoose.Types.ObjectId[]
  voteCount: number
  issue: mongoose.Types.ObjectId | null
  source: { kind: 'manual' | 'agent'; name: string | null }
  statusHistory: DevSuggestionStatusEntry[]
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const devSuggestionSchema = new Schema<IDevSuggestion>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    problem: { type: String, required: true, trim: true, maxlength: 4000 },
    project: { type: Schema.Types.ObjectId, ref: 'DevProject', default: null },
    link: {
      type: new Schema(
        {
          kind: { type: String, enum: DEV_SUGGESTION_LINK_KINDS, required: true },
          ref: { type: Schema.Types.ObjectId, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    requester: {
      type: new Schema(
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          name: { type: String, default: '', trim: true, maxlength: 120 },
        },
        { _id: false },
      ),
      default: () => ({ user: null, name: '' }),
    },
    impact: {
      type: new Schema(
        {
          amountEur: { type: Number, default: null, min: 0 },
          level: { type: String, enum: DEV_SUGGESTION_IMPACT_LEVELS, default: 'MEDIUM' },
        },
        { _id: false },
      ),
      default: () => ({ amountEur: null, level: 'MEDIUM' }),
    },
    status: { type: String, enum: DEV_SUGGESTION_STATUSES, default: 'NEW', index: true },
    rejectionReason: { type: String, default: null, maxlength: 2000 },
    voters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    voteCount: { type: Number, default: 0 },
    issue: { type: Schema.Types.ObjectId, ref: 'DevIssue', default: null },
    source: {
      type: new Schema(
        {
          kind: { type: String, enum: ['manual', 'agent'], default: 'manual' },
          name: { type: String, default: null, maxlength: 160 },
        },
        { _id: false },
      ),
      default: () => ({ kind: 'manual', name: null }),
    },
    statusHistory: [
      new Schema(
        {
          status: { type: String, enum: DEV_SUGGESTION_STATUSES, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          at: { type: Date, default: Date.now },
          note: { type: String, default: '', maxlength: 2000 },
        },
        { _id: false },
      ),
    ],
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

devSuggestionSchema.index({ status: 1, archivedAt: 1, 'impact.amountEur': -1 })
devSuggestionSchema.index({ project: 1 })
devSuggestionSchema.index({ 'link.ref': 1 })

export default mongoose.model<IDevSuggestion>('DevSuggestion', devSuggestionSchema)
