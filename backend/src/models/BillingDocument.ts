import mongoose from 'mongoose'
import type { IBillingDocument } from '../types/models/index.js'
import { moneyError } from '../lib/projectFinance/money.js'

const payerSchema = new mongoose.Schema(
  {
    payerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['CLIENT', 'SUBSIDIARY', 'THIRD_PARTY'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    subsidiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsidiary', default: null },
    billingContact: {
      name: String,
      addressLine1: String,
      addressLine2: String,
      postalCode: String,
      city: String,
      country: String,
      email: String,
      siret: String,
      vatNumber: String,
    },
  },
  { _id: false },
)

const financeLinkSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['INSTALLMENT', 'SUBSCRIPTION'], required: true },
    installmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
  },
  { _id: false },
)

const billingLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: true },
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
    payer: { type: payerSchema, default: null },
    financeLink: { type: financeLinkSchema, default: null },
    financeKey: { type: String, default: null },
    creditedInvoice: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingDocument', default: null },
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
  { timestamps: true },
)

billingDocumentSchema.index({ project: 1, type: 1 })
billingDocumentSchema.index({ client: 1, type: 1 })
billingDocumentSchema.index({ number: 1 }, { unique: true })
billingDocumentSchema.index(
  { financeKey: 1 },
  { unique: true, partialFilterExpression: { financeKey: { $type: 'string' } } },
)

billingDocumentSchema.post('init', function (doc) {
  doc.$locals.loadedStatus = doc.status
})
billingDocumentSchema.pre('save', function () {
  if (this.type !== 'INVOICE' || this.isNew) return
  const amountsChanged = ['lines', 'subtotal', 'taxTotal', 'total'].some((field) => this.isModified(field))
  let message: string | null = null
  if (amountsChanged && (this.financeLink || this.creditedInvoice)) {
    message = "Montants fixés par l'échéancier du projet"
  } else if (amountsChanged && this.$locals.loadedStatus !== 'DRAFT') {
    message = "Les montants d'une facture émise ne se modifient pas ; passez par un avoir"
  }
  if (this.isModified('status') && this.status === 'DRAFT' && this.$locals.loadedStatus !== 'DRAFT') {
    message = 'Une facture sortie du brouillon ne peut pas redevenir un brouillon'
  }
  if (
    (this.financeLink || this.creditedInvoice) &&
    this.$locals.loadedStatus === 'CANCELLED' &&
    this.status !== 'CANCELLED'
  ) {
    message = 'Une facture d’échéance annulée ne peut pas être réactivée'
  }
  if ((this.financeLink || this.creditedInvoice) && this.isModified('status') && this.status === 'CANCELLED') {
    if (this.$locals.loadedStatus !== 'DRAFT') {
      message = "Seul un brouillon de facture d'échéance peut être annulé"
    }
  }
  if (message) {
    const err = moneyError(message)
    err.status = 409
    throw err
  }
  if (this.financeLink && this.isModified('status') && this.status === 'CANCELLED') this.financeKey = null
  // Le statut doit encore être celui chargé pour ne pas annuler une émission concurrente.
  this.$where = { ...this.$where, status: this.$locals.loadedStatus }
})
billingDocumentSchema.post('save', function (doc) {
  doc.$locals.loadedStatus = doc.status
})
billingDocumentSchema.post('save', function (error: Error, doc: IBillingDocument, next: (err?: Error) => void) {
  if (error instanceof mongoose.Error.DocumentNotFoundError && doc.type === 'INVOICE') {
    const err = moneyError('Le statut de la facture a changé ; rechargez-la avant de réessayer')
    err.status = 409
    next(err)
    return
  }
  next(error)
})

export default mongoose.model<IBillingDocument>('BillingDocument', billingDocumentSchema)
