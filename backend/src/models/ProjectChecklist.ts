import mongoose from 'mongoose'

export interface IChecklistItem {
  key: string
  label: string
  checked: boolean
  checkedAt: Date | null
  checkedBy: mongoose.Types.ObjectId | null
}

export interface IProjectChecklist {
  project: mongoose.Types.ObjectId
  type: 'STARTUP' | 'CLOSURE'
  items: IChecklistItem[]
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const checklistItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    checked: { type: Boolean, default: false },
    checkedAt: { type: Date, default: null },
    checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
)

const projectChecklistSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['STARTUP', 'CLOSURE'], required: true },
    items: { type: [checklistItemSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

projectChecklistSchema.index({ project: 1, type: 1 }, { unique: true })

export default mongoose.model('ProjectChecklist', projectChecklistSchema)
