import mongoose from 'mongoose'

export const PUBLIC_ANALYTICS_EVENTS = [
  'page_view',
  'cta_click',
  'contact_form_started',
  'contact_form_submitted',
  'contact_form_succeeded',
  'contact_form_failed',
] as const

export type PublicAnalyticsEvent = (typeof PUBLIC_ANALYTICS_EVENTS)[number]

export interface IDailyPublicMetric {
  day: Date
  path: string
  event: PublicAnalyticsEvent
  cta: string
  count: number
}

const dailyPublicMetricSchema = new mongoose.Schema<IDailyPublicMetric>(
  {
    // Date is normalized to midnight UTC. It is a bucket, not a timestamp of
    // an identifiable visit.
    day: { type: Date, required: true },
    path: { type: String, required: true, maxlength: 120 },
    event: { type: String, enum: PUBLIC_ANALYTICS_EVENTS, required: true },
    cta: { type: String, default: '', maxlength: 80 },
    count: { type: Number, required: true, default: 0, min: 0 },
  },
  { versionKey: false },
)

dailyPublicMetricSchema.index({ day: 1, path: 1, event: 1, cta: 1 }, { unique: true })
dailyPublicMetricSchema.index({ day: 1 })

export default mongoose.model<IDailyPublicMetric>('DailyPublicMetric', dailyPublicMetricSchema)
