import mongoose from 'mongoose'
import type { IBeneficiary } from '../types/models/index.js'
import User from './User.js'
import ChartOfAccount from './ChartOfAccount.js'

const beneficiarySchema = new mongoose.Schema<IBeneficiary>(
  {
    kind: { type: String, enum: ['ASSOCIE', 'COMMERCIAL', 'FREELANCE', 'APPORTEUR'], required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      validate: {
        validator: async (id: mongoose.Types.ObjectId | null) =>
          !id || !!(await User.exists({ _id: id, role: { $ne: 'CLIENT' } })),
        message: 'Le bénéficiaire doit être lié à un utilisateur interne existant',
      },
    },
    displayName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: '' },
    siret: { type: String, trim: true, default: '' },
    vatRegistered: { type: Boolean, default: false },
    defaultAccountCode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: async (code: string) => !!(await ChartOfAccount.exists({ code, isActive: true })),
        message: 'Le compte comptable doit exister et être actif',
      },
    },
    settlementMode: { type: String, enum: ['BANQUE', 'PAIE'], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)
beneficiarySchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } })

export default mongoose.model<IBeneficiary>('Beneficiary', beneficiarySchema)
