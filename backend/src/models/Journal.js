import mongoose from 'mongoose'

const journalSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['VENTE', 'ACHAT', 'BANQUE', 'CAISSE', 'OD', 'AN'],
      required: true,
    },
    counterAccount: { type: String, default: '' },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
)

journalSchema.statics.findByCode = function findByCode(code) {
  return this.findOne({ code: (code || '').toUpperCase() })
}

export default mongoose.model('Journal', journalSchema)
