import mongoose from 'mongoose'

export const SALES_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export function isSalesTargetAmount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.round(value * 100) / 100 === value
}

const salesTargetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, match: SALES_MONTH_PATTERN },
    amount: { type: Number, required: true, validate: isSalesTargetAmount },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
salesTargetSchema.index({ user: 1, month: 1 }, { unique: true })

export default mongoose.model('SalesTarget', salesTargetSchema)
