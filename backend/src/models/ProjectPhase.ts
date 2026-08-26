import mongoose from 'mongoose'
import type { IProjectPhase } from '../types/models/index.js'

// Même esprit que le signatureSchema de QuoteProposal : l'identité du valideur
// est dénormalisée dans le document pour rester lisible même si le compte change.
const validationSchema = new mongoose.Schema(
  {
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    validatedByName: { type: String, default: '' },
    validatedAt: { type: Date, default: null },
    comment: { type: String, default: '' },
  },
  { _id: false },
)

const revisionRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, default: '' },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
)

const projectPhaseSchema = new mongoose.Schema<IProjectPhase>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
    dueAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['A_VENIR', 'EN_COURS', 'EN_ATTENTE_VALIDATION', 'TERMINEE'],
      default: 'A_VENIR',
    },
    requiresClientValidation: { type: Boolean, default: false },
    linkedItems: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProjectItem' }], default: [] },
    validation: { type: validationSchema, default: () => ({}) },
    revisionRequests: { type: [revisionRequestSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

// Tri du pipeline : toutes les lectures trient par ordre croissant sur un projet.
projectPhaseSchema.index({ project: 1, order: 1 })

export default mongoose.model<IProjectPhase>('ProjectPhase', projectPhaseSchema)
