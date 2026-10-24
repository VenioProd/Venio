import mongoose from 'mongoose'
import type { IShareSettlement } from '../types/models/index.js'

const shareSettlementSchema = new mongoose.Schema<IShareSettlement>(
  {
    beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Beneficiary', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    kind: { type: String, enum: ['SETTLEMENT', 'REVERSAL'], required: true },
    htCents: {
      type: Number,
      required: true,
      validate: function (value: number) {
        return Number.isSafeInteger(value) && (this.kind === 'SETTLEMENT' ? value > 0 : value < 0)
      },
    },
    vatCents: {
      type: Number,
      required: true,
      validate: function (value: number) {
        return Number.isSafeInteger(value) && (this.kind === 'SETTLEMENT' ? value >= 0 : value <= 0)
      },
    },
    paidAt: { type: Date, required: true, validate: (value: Date) => value.getTime() <= Date.now() },
    invoiceRef: { type: String, required: true, trim: true },
    note: { type: String, default: '' },
    mode: { type: String, enum: ['BANQUE', 'PAIE'], required: true },
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShareSettlement',
      default: null,
      required: function (this: IShareSettlement): boolean {
        return this.kind === 'REVERSAL'
      },
    },
    entry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingEntry',
      default: null,
      required: function (this: IShareSettlement): boolean {
        return this.mode === 'BANQUE'
      },
    },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
shareSettlementSchema.index({ idempotencyKey: 1 }, { unique: true })
shareSettlementSchema.index(
  { reversalOf: 1 },
  { unique: true, partialFilterExpression: { reversalOf: { $type: 'objectId' } } },
)
shareSettlementSchema.index({ beneficiary: 1, project: 1, paidAt: 1 })
shareSettlementSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Un versement est immuable')
})
shareSettlementSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'],
  function () {
    throw new Error('Un versement est immuable')
  },
)

export default mongoose.model<IShareSettlement>('ShareSettlement', shareSettlementSchema)
