import mongoose, { Model } from 'mongoose'
import type { IFiscalYear } from '../types/models/index.js'

// Statics : recherche par date contenue dans l'exercice
interface FiscalYearModel extends Model<IFiscalYear> {
  findContaining(date: Date): Promise<IFiscalYear | null>
}

const fiscalYearSchema = new mongoose.Schema<IFiscalYear, FiscalYearModel>(
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

// Trouve l'exercice qui contient la date passée (start <= date <= end)
fiscalYearSchema.statics.findContaining = function findContaining(date: Date) {
  return this.findOne({
    startDate: { $lte: date },
    endDate: { $gte: date },
  })
}

export default mongoose.model<IFiscalYear, FiscalYearModel>('FiscalYear', fiscalYearSchema)
