import mongoose, { Schema, Document } from 'mongoose'

export const DEV_ISSUE_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
] as const
export type DevIssueStatus = (typeof DEV_ISSUE_STATUSES)[number]

export const DEV_ISSUE_PRIORITIES = ['NO_PRIORITY', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type DevIssuePriority = (typeof DEV_ISSUE_PRIORITIES)[number]

export const DEV_ISSUE_TYPES = ['FEATURE', 'BUG', 'CHORE', 'TASK'] as const
export type DevIssueType = (typeof DEV_ISSUE_TYPES)[number]

export const DEV_CI_STATUSES = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'UNKNOWN'] as const
export type DevCiStatus = (typeof DEV_CI_STATUSES)[number]

export interface DevIssueGithubLink {
  repo: string | null
  prNumber: number | null
  prUrl: string | null
  branch: string | null
  commitSha: string | null
  ciStatus: DevCiStatus | null
  mergedAt: Date | null
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
  dueDate: Date | null
  startedAt: Date | null
  completedAt: Date | null
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
    dueDate: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
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
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
)

devIssueSchema.index({ project: 1, number: 1 }, { unique: true })
devIssueSchema.index({ project: 1, status: 1, updatedAt: -1 })
devIssueSchema.index({ status: 1, priority: 1, updatedAt: -1 })

export default mongoose.model<IDevIssue>('DevIssue', devIssueSchema)
