import mongoose from 'mongoose'

const vatRateSchema = new mongoose.Schema(
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

vatRateSchema.statics.findByCode = function findByCode(code) {
  return this.findOne({ code })
}

export default mongoose.model('VatRate', vatRateSchema)
