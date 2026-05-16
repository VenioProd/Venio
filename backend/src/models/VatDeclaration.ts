import mongoose from 'mongoose'
import type { IVatDeclaration } from '../types/models/index.js'

// Sous-schéma : une ligne CA3 / CA12 préremplie (code + base + montant).
const vatLineSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // ligne CA3 : '01', '08', '09', '16', '20'…
    label: { type: String, default: '' },
    base: { type: Number, default: 0 }, // base HT
    amount: { type: Number, default: 0 }, // montant TVA
  },
  { _id: false }
)

// Sous-schéma : ventilation par taux (collecté / déductible).
const vatRateBreakdownSchema = new mongoose.Schema(
  {
    rate: { type: Number, required: true }, // 20, 10, 5.5, 2.1, 0
    base: { type: Number, default: 0 }, // base HT cumulée
    amount: { type: Number, default: 0 }, // TVA cumulée
  },
  { _id: false }
)

const vatDeclarationSchema = new mongoose.Schema<IVatDeclaration>(
  {
    type: {
      type: String,
      enum: ['CA3', 'CA12'],
      required: true,
    },
    regime: {
      type: String,
      enum: ['REEL_NORMAL', 'REEL_SIMPLIFIE', 'MICRO'],
      default: 'REEL_NORMAL',
    },
    periodicity: {
      type: String,
      enum: ['MENSUEL', 'TRIMESTRIEL', 'ANNUEL'],
      default: 'MENSUEL',
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    fiscalYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear', default: null },

    // Détail par taux
    collectedByRate: { type: [vatRateBreakdownSchema], default: [] },
    deductibleByRate: { type: [vatRateBreakdownSchema], default: [] },

    // Totaux
    totalCollected: { type: Number, default: 0 }, // TVA brute due
    totalDeductible: { type: Number, default: 0 }, // TVA déductible (achats + immo)
    totalDue: { type: Number, default: 0 }, // = collectée - déductible - crédit antérieur
    previousCredit: { type: Number, default: 0 }, // crédit reporté du mois/trim. précédent
    currentCredit: { type: Number, default: 0 }, // crédit à reporter

    // Lignes CA3 / CA12 préremplies
    declarationLines: { type: [vatLineSchema], default: [] },

    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED'],
      default: 'DRAFT',
    },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedRef: { type: String, default: '' }, // n° télédéclaration impots.gouv

    notes: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

vatDeclarationSchema.index({ periodStart: 1, periodEnd: 1 })
vatDeclarationSchema.index({ status: 1 })
vatDeclarationSchema.index({ type: 1 })

export default mongoose.model<IVatDeclaration>('VatDeclaration', vatDeclarationSchema)
