import mongoose, { Schema, Document } from 'mongoose'

export const DEV_PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const
export type DevProjectStatus = (typeof DEV_PROJECT_STATUSES)[number]

export interface DevProjectGithubConfig {
  owner: string | null
  repo: string | null
  defaultBranch: string | null
  htmlUrl: string | null
  repoPath: string | null
}

export interface IDevProject extends Document {
  _id: mongoose.Types.ObjectId
  key: string
  name: string
  description: string
  color: string
  status: DevProjectStatus
  lead: mongoose.Types.ObjectId | null
  members: mongoose.Types.ObjectId[]
  createdBy: mongoose.Types.ObjectId
  // High-water mark used to allocate the per-project issue number atomically.
  // Missing on legacy documents — the issue-creation helper backfills from
  // max(DevIssue.number) when seen as 0.
  issueCounter: number
  github: DevProjectGithubConfig | null
  createdAt: Date
  updatedAt: Date
}

const devProjectSchema = new Schema<IDevProject>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 8,
      match: /^[A-Z][A-Z0-9]+$/,
      unique: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    color: { type: String, default: '#7c5cff' },
    status: {
      type: String,
      enum: DEV_PROJECT_STATUSES,
      default: 'ACTIVE',
    },
    lead: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    issueCounter: { type: Number, default: 0 },
    github: {
      type: new Schema<DevProjectGithubConfig>(
        {
          owner: { type: String, default: null, maxlength: 80 },
          repo: { type: String, default: null, maxlength: 120 },
          defaultBranch: { type: String, default: null, maxlength: 80 },
          htmlUrl: { type: String, default: null, maxlength: 300 },
          repoPath: { type: String, default: null, maxlength: 200 },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
)

devProjectSchema.index({ status: 1, updatedAt: -1 })

export default mongoose.model<IDevProject>('DevProject', devProjectSchema)
