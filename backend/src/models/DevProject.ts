import mongoose, { Schema, Document } from 'mongoose'

export const DEV_PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const
export type DevProjectStatus = (typeof DEV_PROJECT_STATUSES)[number]

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
  },
  { timestamps: true }
)

devProjectSchema.index({ status: 1, updatedAt: -1 })

export default mongoose.model<IDevProject>('DevProject', devProjectSchema)
