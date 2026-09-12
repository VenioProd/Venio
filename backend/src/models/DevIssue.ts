import mongoose, { Schema, Document } from 'mongoose'

export const DEV_ISSUE_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'BLOCKED',
  'DONE',
  'DUPLICATE',
  'CANCELLED',
] as const
export type DevIssueStatus = (typeof DEV_ISSUE_STATUSES)[number]

export const DEV_ISSUE_PRIORITIES = ['NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type DevIssuePriority = (typeof DEV_ISSUE_PRIORITIES)[number]

export const DEV_ISSUE_TYPES = [
  'FEATURE',
  'BUG',
  'CHORE',
  'TASK',
  'REFACTOR',
  'SECURITY',
  'CI',
  'DEPLOY',
  'DOC',
] as const
export type DevIssueType = (typeof DEV_ISSUE_TYPES)[number]

export const DEV_CI_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'UNKNOWN'] as const
export type DevCiStatus = (typeof DEV_CI_STATUSES)[number]

export const DEV_AI_MODELS = [
  'CLAUDE_SONNET',
  'CLAUDE_OPUS',
  'CLAUDE_FABLE',
  'GPT_5_6_LUNA',
  'GPT_5_6_TERRA',
  'GPT_5_6_SOL',
  'GPT_6_ASTRA',
] as const
export type DevAiModel = (typeof DEV_AI_MODELS)[number]

export const DEV_REASONING_EFFORTS = ['LOW', 'MEDIUM', 'HIGH', 'MAX'] as const
export type DevReasoningEffort = (typeof DEV_REASONING_EFFORTS)[number]

export interface DevIssueGithubLink {
  repo: string | null
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  commitSha: string | null
  ciStatus: DevCiStatus | null
  mergedAt: Date | null
}

export interface DevIssueRelation {
  type: 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates'
  issue: mongoose.Types.ObjectId
}

export interface DevIssueExternalRef {
  linearId: string | null
  linearUrl: string | null
  linearIdentifier: string | null
}

export interface DevIssueSource {
  kind: 'manual' | 'agent' | 'linear' | 'github' | 'import'
  name: string | null
}

export interface DevIssueExecutionProfile {
  recommendedModel: DevAiModel | null
  reasoningEffort: DevReasoningEffort | null
  context: string
  executionPlan: string
  verificationPlan: string
  handoff: string
}

export interface IDevIssue extends Document {
  _id: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  number: number
  identifier: string
  title: string
  description: string
  type: DevIssueType
  status: DevIssueStatus
  priority: DevIssuePriority
  assignee: mongoose.Types.ObjectId | null
  reporter: mongoose.Types.ObjectId
  labels: string[]
  estimate: number | null
  rank: string | null
  cycle: string | null
  parent: mongoose.Types.ObjectId | null
  relations: DevIssueRelation[]
  source: DevIssueSource | null
  external: DevIssueExternalRef | null
  agentAssignee: string | null
  createdByModel: string | null
  executionProfile: DevIssueExecutionProfile | null
  acceptanceCriteria: string[]
  subtasks: string[]
  blockedReason: string | null
  blockedBy: mongoose.Types.ObjectId[]
  duplicateOf: mongoose.Types.ObjectId | null
  dueDate: Date | null
  startedAt: Date | null
  completedAt: Date | null
  archivedAt: Date | null
  github: DevIssueGithubLink | null
  createdAt: Date
  updatedAt: Date
}

const devIssueSchema = new Schema<IDevIssue>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'DevProject', required: true, index: true },
    number: { type: Number, required: true },
    identifier: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 20000 },
    type: { type: String, enum: DEV_ISSUE_TYPES, default: 'TASK' },
    status: { type: String, enum: DEV_ISSUE_STATUSES, default: 'BACKLOG', index: true },
    priority: { type: String, enum: DEV_ISSUE_PRIORITIES, default: 'NO_PRIORITY', index: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    labels: { type: [String], default: [] },
    estimate: { type: Number, default: null, min: 0, max: 999 },
    rank: { type: String, default: null, maxlength: 80 },
    cycle: { type: String, default: null, trim: true, maxlength: 120, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'DevIssue', default: null, index: true },
    relations: {
      type: [
        new Schema<DevIssueRelation>(
          {
            type: { type: String, enum: ['blocks', 'blocked_by', 'relates_to', 'duplicates'], required: true },
            issue: { type: Schema.Types.ObjectId, ref: 'DevIssue', required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    source: {
      type: new Schema<DevIssueSource>(
        {
          kind: { type: String, enum: ['manual', 'agent', 'linear', 'github', 'import'], default: 'manual' },
          name: { type: String, default: null, maxlength: 120 },
        },
        { _id: false },
      ),
      default: null,
    },
    external: {
      type: new Schema<DevIssueExternalRef>(
        {
          linearId: { type: String, default: null, maxlength: 120 },
          linearUrl: { type: String, default: null, maxlength: 500 },
          linearIdentifier: { type: String, default: null, maxlength: 80 },
        },
        { _id: false },
      ),
      default: null,
    },
    agentAssignee: { type: String, default: null, trim: true, maxlength: 80, index: true },
    createdByModel: { type: String, default: null, trim: true, maxlength: 160 },
    executionProfile: {
      type: new Schema<DevIssueExecutionProfile>(
        {
          recommendedModel: { type: String, enum: [...DEV_AI_MODELS, null], default: null },
          reasoningEffort: { type: String, enum: [...DEV_REASONING_EFFORTS, null], default: null },
          context: { type: String, default: '', maxlength: 6000 },
          executionPlan: { type: String, default: '', maxlength: 6000 },
          verificationPlan: { type: String, default: '', maxlength: 4000 },
          handoff: { type: String, default: '', maxlength: 4000 },
        },
        { _id: false },
      ),
      default: null,
    },
    acceptanceCriteria: { type: [String], default: [] },
    subtasks: { type: [String], default: [] },
    blockedReason: { type: String, default: null, maxlength: 2000 },
    blockedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'DevIssue' }], default: [] },
    duplicateOf: { type: Schema.Types.ObjectId, ref: 'DevIssue', default: null },
    dueDate: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null, index: true },
    github: {
      type: new Schema<DevIssueGithubLink>(
        {
          repo: { type: String, default: null, maxlength: 200 },
          prNumber: { type: Number, default: null },
          prUrl: { type: String, default: null, maxlength: 500 },
          branch: { type: String, default: null, maxlength: 200 },
          commitSha: { type: String, default: null, maxlength: 80 },
          ciStatus: { type: String, enum: [...DEV_CI_STATUSES, null], default: null },
          mergedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
)

devIssueSchema.index({ project: 1, number: 1 }, { unique: true })
devIssueSchema.index({ project: 1, status: 1, updatedAt: -1 })
devIssueSchema.index({ project: 1, rank: 1 })
devIssueSchema.index({ cycle: 1, status: 1 })
devIssueSchema.index({ labels: 1 })
devIssueSchema.index({ 'external.linearId': 1 }, { sparse: true })
devIssueSchema.index({ status: 1, priority: 1, updatedAt: -1 })

export default mongoose.model<IDevIssue>('DevIssue', devIssueSchema)
