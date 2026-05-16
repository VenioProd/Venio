import mongoose, { Model } from 'mongoose'
import type { IVatRate } from '../types/models/index.js'

interface VatRateModel extends Model<IVatRate> {
  findByCode(code: string): Promise<IVatRate | null>
}

const vatRateSchema = new mongoose.Schema<IVatRate, VatRateModel>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: ['NORMAL', 'INTERMEDIAIRE', 'REDUIT', 'SUPER_REDUIT', 'EXONERE'],
    },
    label: { type: String, required: true },
    rate: { type: Number, required: true, min: 0, max: 100 },
    collectedAccount: { type: String, default: '' },
    deductibleAccount: { type: String, default: '' },
    declarationLine: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    legend: { type: String, default: '' },
  },
  { timestamps: true }
)

vatRateSchema.statics.findByCode = function findByCode(code: string) {
  return this.findOne({ code })
}

export default mongoose.model<IVatRate, VatRateModel>('VatRate', vatRateSchema)
