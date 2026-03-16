import mongoose from 'mongoose'
import type { IProject } from '../types/models/index.js'

const projectSchema = new mongoose.Schema<IProject>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['EN_COURS', 'EN_ATTENTE', 'TERMINE'],
      default: 'EN_COURS',
    },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceTypes: { type: [String], default: [] },
    deliverableTypes: { type: [String], default: [] },
    deadlines: [
      {
        label: { type: String, default: '' },
        dueAt: { type: Date },
      },
    ],
    budget: {
      amount: { type: Number, default: null },
      currency: { type: String, default: 'EUR' },
      note: { type: String, default: '' },
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    projectNumber: { type: String, default: '' },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    responsible: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    internalNotes: { type: String, default: '' },
    isArchived: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    summary: { type: String, default: '' },
    reminderAt: { type: Date, default: null },
    billing: {
      amountInvoiced: { type: Number, default: null },
      billingStatus: {
        type: String,
        enum: ['NON_FACTURE', 'PARTIEL', 'FACTURE'],
        default: 'NON_FACTURE',
      },
      quoteReference: { type: String, default: '' },
    },
  },
  { timestamps: true }
)

export default mongoose.model<IProject>('Project', projectSchema)
