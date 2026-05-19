import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IInboxSnooze extends Document {
  userId: Types.ObjectId
  itemType: string
  sourceId: Types.ObjectId
  snoozedUntil: Date
  createdAt: Date
}

const schema = new Schema<IInboxSnooze>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemType: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    snoozedUntil: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ userId: 1, itemType: 1, sourceId: 1 }, { unique: true })
schema.index({ snoozedUntil: 1 }, { expireAfterSeconds: 0 })  // TTL auto-cleanup

const InboxSnooze = mongoose.model<IInboxSnooze>('InboxSnooze', schema)
export default InboxSnooze
