import mongoose, { Schema, Document, Types } from 'mongoose'

export interface IInboxPin extends Document {
  userId: Types.ObjectId
  refType: string
  refId: Types.ObjectId
  title: string
  link: string
  color?: string
  expiresAt?: Date
  createdAt: Date
}

const schema = new Schema<IInboxPin>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refType: { type: String, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    link: { type: String, required: true },
    color: { type: String },
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

const InboxPin = mongoose.model<IInboxPin>('InboxPin', schema)
export default InboxPin
