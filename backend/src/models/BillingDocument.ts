import mongoose from 'mongoose'
import type { IBillingDocument } from '../types/models/index.js'

const billingLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: true }
)

const billingDocumentSchema = new mongoose.Schema<IBillingDocument>(
  {
    type: {
      type: String,
      enum: ['QUOTE', 'INVOICE'],
      required: true,
    },
    number: { type: String, required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED'],
      default: 'DRAFT',
    },
    issuedAt: { type: Date, default: null },
    dueAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    lines: { type: [billingLineSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    note: { type: String, default: '' },
    pdfStoragePath: { type: String, default: null },
    reminderSentAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

billingDocumentSchema.index({ project: 1, type: 1 })
billingDocumentSchema.index({ client: 1, type: 1 })
billingDocumentSchema.index({ number: 1 }, { unique: true })

export default mongoose.model<IBillingDocument>('BillingDocument', billingDocumentSchema)
