import mongoose, { Schema } from 'mongoose'

const schema = new Schema(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'BillingDocument', required: true, unique: true },
    tokenHash: { type: String, required: true, index: true },
    tokenEncrypted: { type: String, required: true },
    currentCheckoutSessionId: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

export default mongoose.model('InvoicePaymentLink', schema)
