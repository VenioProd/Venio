import mongoose, { Model } from 'mongoose'
import type { IChartOfAccount } from '../types/models/index.js'

interface ChartOfAccountModel extends Model<IChartOfAccount> {
  findByCode(code: string): Promise<IChartOfAccount | null>
}

const chartOfAccountSchema = new mongoose.Schema<IChartOfAccount, ChartOfAccountModel>(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, required: true },
    accountClass: {
      type: Number,
      required: true,
      min: 1,
      max: 9,
    },
    type: {
      type: String,
      enum: ['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT', 'CAPITAUX', 'SPECIAL'],
      required: true,
    },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartOfAccount', default: null },
    isAuxiliary: { type: Boolean, default: false },
    auxiliaryOf: { type: String, default: '' },
    auxiliaryRef: {
      kind: { type: String, enum: ['CLIENT', 'SUPPLIER', 'OTHER', null], default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    isLettrable: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: '' },
  },
  { timestamps: true }
)

chartOfAccountSchema.index({ accountClass: 1, code: 1 })
chartOfAccountSchema.index({ auxiliaryOf: 1 })

// Recherche par code (clé fonctionnelle)
chartOfAccountSchema.statics.findByCode = function findByCode(code: string) {
  return this.findOne({ code })
}

export default mongoose.model<IChartOfAccount, ChartOfAccountModel>('ChartOfAccount', chartOfAccountSchema)
