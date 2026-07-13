import mongoose, { Schema, type Document } from 'mongoose'

export const DEV_AGENT_RUN_STATUSES = [
  'QUEUED',
  'DISPATCHED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'BRIDGE_UNAVAILABLE',
  'DISPATCH_FAILED',
] as const

export type DevAgentRunStatus = (typeof DEV_AGENT_RUN_STATUSES)[number]

export interface IDevAgentRun extends Document {
  _id: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  issue: mongoose.Types.ObjectId
  recommendationId: string | null
  requestedBy: mongoose.Types.ObjectId
  idempotencyKey: string
  requestFingerprint: string
  target: { agent: string; model: string } | null
  status: DevAgentRunStatus
  bridgeExecutionId: string | null
  failureCode: string | null
  context: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const devAgentRunSchema = new Schema<IDevAgentRun>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'DevProject', required: true, index: true },
    issue: { type: Schema.Types.ObjectId, ref: 'DevIssue', required: true, index: true },
    recommendationId: { type: String, default: null, maxlength: 160 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    idempotencyKey: { type: String, required: true, maxlength: 255 },
    requestFingerprint: { type: String, required: true, maxlength: 160 },
    target: {
      type: new Schema(
        {
          agent: { type: String, required: true, maxlength: 80 },
          model: { type: String, required: true, maxlength: 160 },
        },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: DEV_AGENT_RUN_STATUSES, required: true, index: true },
    bridgeExecutionId: { type: String, default: null, maxlength: 200 },
    failureCode: { type: String, default: null, maxlength: 80 },
    // Context is built on the server and retained as an audit snapshot. It
    // deliberately contains no browser-provided commands or credentials.
    context: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
)

devAgentRunSchema.index({ requestedBy: 1, idempotencyKey: 1 }, { unique: true })
devAgentRunSchema.index({ issue: 1, createdAt: -1 })

export default mongoose.model<IDevAgentRun>('DevAgentRun', devAgentRunSchema)
