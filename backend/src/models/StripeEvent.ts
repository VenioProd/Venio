import mongoose, { Schema } from 'mongoose'

const schema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['PROCESSED', 'NEEDS_REVIEW', 'IGNORED'], required: true },
    reason: { type: String, default: '' },
    objectId: { type: String, default: null },
    invoice: { type: Schema.Types.ObjectId, ref: 'BillingDocument', default: null },
    payment: { type: Schema.Types.ObjectId, ref: 'ProjectPayment', default: null },
    attempts: { type: Number, default: 0 },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
schema.index({ status: 1, createdAt: -1 })

export default mongoose.model('StripeEvent', schema)
