import mongoose from 'mongoose'
import type { IProjectPayment } from '../types/models/index.js'

const projectPaymentSchema = new mongoose.Schema<IProjectPayment>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingDocument', required: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    kind: { type: String, enum: ['PAYMENT', 'REFUND'], required: true },
    amountTtcCents: {
      type: Number,
      required: true,
      validate: function (value: number) {
        return Number.isSafeInteger(value) && (this.kind === 'PAYMENT' ? value > 0 : value < 0)
      },
    },
    htCents: { type: Number, required: true, validate: Number.isSafeInteger },
    method: { type: String, enum: ['VIREMENT', 'CB', 'PRELEVEMENT', 'STRIPE'], required: true },
    receivedAt: { type: Date, required: true, validate: (value: Date) => value.getTime() <= Date.now() },
    reference: { type: String, default: '' },
    reason: {
      type: String,
      default: '',
      required: function (this: IProjectPayment): boolean {
        return this.kind === 'REFUND'
      },
    },
    refundOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectPayment',
      default: null,
      required: function (this: IProjectPayment): boolean {
        return this.kind === 'REFUND'
      },
    },
    ruleVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'ShareRuleVersion', default: null },
    entry: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountingEntry', required: true },
    source: { type: String, enum: ['MANUAL', 'STRIPE'], required: true },
    stripePaymentIntentId: { type: String, index: true },
    stripeChargeId: { type: String, index: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)
projectPaymentSchema.index({ idempotencyKey: 1 }, { unique: true })
projectPaymentSchema.index({ invoice: 1, receivedAt: 1 })
projectPaymentSchema.index({ project: 1, receivedAt: -1 })
projectPaymentSchema.index({ refundOf: 1 })
projectPaymentSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Un encaissement est immuable')
})
projectPaymentSchema.pre(
  ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne', 'findOneAndReplace'],
  function () {
    throw new Error('Un encaissement est immuable')
  },
)

export default mongoose.model<IProjectPayment>('ProjectPayment', projectPaymentSchema)
