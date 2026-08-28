import mongoose from 'mongoose'
import type { ILead } from '../types/models/index.js'

const leadSchema = new mongoose.Schema<ILead>(
  {
    company: { type: String, required: true, trim: true },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    source: { type: String, default: '' },
    status: {
      type: String,
      enum: ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'],
      default: 'LEAD',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    budget: { type: Number, default: null },
    nextActionAt: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    serviceType: { type: String, default: '' }, // Type de service proposé
    leadTemperature: {
      type: String,
      enum: ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'],
      default: 'TIEDE',
    },
    interactionNotes: { type: String, default: '' }, // Notes détaillées des interactions
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Les demandes publiques sont créées par le système, sans utilisateur interne.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    statusChangedAt: { type: Date, default: null },
    clientAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    score: { type: Number, default: null }, // Lead scoring (0-100)
    // Motif de perte : exigé par l'interface, accepté vide par l'API pour ne
    // pas casser l'agent ni les automatisations qui passent des leads à LOST.
    lostReason: { type: String, default: '' },
    lostComment: { type: String, default: '' },
  },
  { timestamps: true },
)

leadSchema.index({ status: 1, priority: 1 })
leadSchema.index({ assignedTo: 1, nextActionAt: 1 })
leadSchema.index({ company: 1 })
leadSchema.index({ clientAccountId: 1 })
leadSchema.index({ score: -1 }) // Index for sorting by score
leadSchema.index({ status: 1, createdAt: -1 }) // Cohortes du pilotage

export default mongoose.model<ILead>('Lead', leadSchema)
