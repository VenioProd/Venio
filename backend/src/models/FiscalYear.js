import mongoose from 'mongoose'

const fiscalYearSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['OUVERT', 'CLOTURE'],
      default: 'OUVERT',
    },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    openingEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingEntry', default: null },
  },
  { timestamps: true }
)

fiscalYearSchema.index({ startDate: 1, endDate: 1 })

fiscalYearSchema.statics.findContaining = function findContaining(date) {
  return this.findOne({
    startDate: { $lte: date },
    endDate: { $gte: date },
  })
}

export default mongoose.model('FiscalYear', fiscalYearSchema)
