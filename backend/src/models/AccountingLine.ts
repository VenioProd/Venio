import mongoose from 'mongoose'
import type { IAccountingLine } from '../types/models/index.js'

const accountingLineSchema = new mongoose.Schema<IAccountingLine>(
  {
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingEntry', required: true },
    journalCode: { type: String, required: true, uppercase: true },
    fiscalYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear', required: true },
    date: { type: Date, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartOfAccount', required: true },
    accountCode: { type: String, required: true },
    accountLabel: { type: String, default: '' },
    label: { type: String, default: '' },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    lettrage: { type: String, default: '' },
    lettrageDate: { type: Date, default: null },
    vatRate: { type: mongoose.Schema.Types.ObjectId, ref: 'VatRate', default: null },
    vatRateValue: { type: Number, default: null },
    currency: { type: String, default: 'EUR' },
    originalAmount: { type: Number, default: null },
    originalCurrency: { type: String, default: '' },
    auxiliaryRef: {
      // Note : kind reste typé comme dans le source JS (string), null toléré
      // pour aligner sur IAuxiliaryRef (CLIENT/SUPPLIER/OTHER/null).
      kind: { type: String, enum: ['CLIENT', 'SUPPLIER', 'OTHER', null], default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    sortIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
)

accountingLineSchema.index({ entry: 1, sortIndex: 1 })
accountingLineSchema.index({ accountCode: 1, date: 1 })
accountingLineSchema.index({ account: 1, date: 1 })
accountingLineSchema.index({ accountCode: 1, lettrage: 1 })
accountingLineSchema.index({ fiscalYear: 1, journalCode: 1, date: 1 })

export default mongoose.model<IAccountingLine>('AccountingLine', accountingLineSchema)
