import mongoose from 'mongoose'
import type { IQuoteProposal } from '../types/models/index.js'

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['text', 'longtext', 'choice', 'multichoice', 'boolean', 'number'],
      required: true,
    },
    label: { type: String, required: true, trim: true },
    help: { type: String, default: '' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true },
)

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, required: true },
    value: { type: String, default: '' },
  },
  { _id: false },
)

const lineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    detail: { type: String, default: '' },
    quantity: { type: Number, required: true, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    isOptional: { type: Boolean, default: false },
    isSelectedByDefault: { type: Boolean, default: false },
    group: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: true },
)

const signatureSchema = new mongoose.Schema(
  {
    signedAt: { type: Date, default: null },
    signerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    signerName: { type: String, default: '' },
    signerEmail: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    consentText: { type: String, default: '' },
    documentHash: { type: String, default: '' },
    proofVersion: { type: Number, default: 1 },
  },
  { _id: false },
)

const quoteProposalSchema = new mongoose.Schema<IQuoteProposal>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    intro: { type: String, default: '' },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'],
      default: 'DRAFT',
    },
    expiresAt: { type: Date, default: null },
    questions: { type: [questionSchema], default: [] },
    answers: { type: [answerSchema], default: [] },
    lines: { type: [lineSchema], default: [] },
    selectedOptionalLineIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    specification: {
      content: { type: String, default: '' },
      isManual: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null },
    },
    signature: { type: signatureSchema, default: () => ({}) },
    billingDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingDocument', default: null },
  },
  { timestamps: true },
)

quoteProposalSchema.index({ project: 1, status: 1 })
quoteProposalSchema.index({ client: 1, status: 1 })

export default mongoose.model<IQuoteProposal>('QuoteProposal', quoteProposalSchema)
