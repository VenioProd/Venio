import mongoose, { Schema, Document } from 'mongoose'
import { betaAttachmentSchema, type BetaAttachment } from './BetaRun.js'

export interface IBetaComment extends Document {
  _id: mongoose.Types.ObjectId
  run: mongoose.Types.ObjectId
  campaign: mongoose.Types.ObjectId
  authorUser: mongoose.Types.ObjectId | null
  authorTester: mongoose.Types.ObjectId | null
  body: string
  attachments: BetaAttachment[]
  // Une réponse d'équipe peut rester interne. Un message de testeur est
  // toujours visible : c'est le sien.
  visibleToTester: boolean
  createdAt: Date
  updatedAt: Date
}

const betaCommentSchema = new Schema<IBetaComment>(
  {
    run: { type: Schema.Types.ObjectId, ref: 'BetaRun', required: true, index: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'BetaCampaign', required: true, index: true },
    authorUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    authorTester: { type: Schema.Types.ObjectId, ref: 'BetaTester', default: null },
    body: { type: String, required: true, maxlength: 10000 },
    attachments: { type: [betaAttachmentSchema], default: [] },
    visibleToTester: { type: Boolean, default: true },
  },
  { timestamps: true },
)

betaCommentSchema.pre('validate', function (next) {
  if (Boolean(this.authorUser) === Boolean(this.authorTester)) {
    return next(new Error('Un message doit avoir exactement un auteur'))
  }
  return next()
})

betaCommentSchema.index({ run: 1, createdAt: 1 })

export default mongoose.model<IBetaComment>('BetaComment', betaCommentSchema)
