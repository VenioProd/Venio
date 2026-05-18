import mongoose from 'mongoose'

export interface IPushSubscription {
  user: mongoose.Types.ObjectId
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string
  lastUsedAt: Date
}

const pushSubscriptionSchema = new mongoose.Schema<IPushSubscription>(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

pushSubscriptionSchema.index({ user: 1, endpoint: 1 })

export default mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema)
