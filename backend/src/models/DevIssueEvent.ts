import mongoose, { Schema, Document } from 'mongoose'

export const DEV_ISSUE_EVENT_TYPES = [
  'created',
  'status_changed',
  'priority_changed',
  'type_changed',
  'assigned',
  'metadata_changed',
  'commented',
  'github_linked',
  'ci_changed',
  'agent_started',
  'agent_blocked',
  'agent_done',
  'deployed',
  'archived',
] as const
export type DevIssueEventType = (typeof DEV_ISSUE_EVENT_TYPES)[number]

export interface IDevIssueEvent extends Document {
  _id: mongoose.Types.ObjectId
  issue: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  actor: mongoose.Types.ObjectId | null
  type: DevIssueEventType
  summary: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const devIssueEventSchema = new Schema<IDevIssueEvent>(
  {
    issue: { type: Schema.Types.ObjectId, ref: 'DevIssue', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'DevProject', required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: DEV_ISSUE_EVENT_TYPES, required: true, index: true },
    summary: { type: String, default: '', maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

devIssueEventSchema.index({ issue: 1, createdAt: 1 })
devIssueEventSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IDevIssueEvent>('DevIssueEvent', devIssueEventSchema)
