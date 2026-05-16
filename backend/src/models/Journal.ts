import mongoose, { Model } from 'mongoose'
import type { IJournal } from '../types/models/index.js'

interface JournalModel extends Model<IJournal> {
  findByCode(code: string): Promise<IJournal | null>
}

const journalSchema = new mongoose.Schema<IJournal, JournalModel>(
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

// Recherche par code (force l'uppercase puisque le schema l'applique)
journalSchema.statics.findByCode = function findByCode(code: string) {
  return this.findOne({ code: (code || '').toUpperCase() })
}

export default mongoose.model<IJournal, JournalModel>('Journal', journalSchema)
