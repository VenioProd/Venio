import mongoose, { Schema, Document } from 'mongoose'

export interface IDevIssueComment extends Document {
  _id: mongoose.Types.ObjectId
  issue: mongoose.Types.ObjectId
  project: mongoose.Types.ObjectId
  author: mongoose.Types.ObjectId
  body: string
  createdAt: Date
  updatedAt: Date
}

const devIssueCommentSchema = new Schema<IDevIssueComment>(
  {
    issue: { type: Schema.Types.ObjectId, ref: 'DevIssue', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'DevProject', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 10000 },
  },
  { timestamps: true }
)

devIssueCommentSchema.index({ issue: 1, createdAt: 1 })
devIssueCommentSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IDevIssueComment>('DevIssueComment', devIssueCommentSchema)
