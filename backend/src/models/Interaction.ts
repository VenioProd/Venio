import mongoose from 'mongoose'
import type { IInteraction } from '../types/models/index.js'

export const INTERACTION_SUBJECT_TYPES = ['LEAD', 'CLIENT'] as const
export const INTERACTION_KINDS = ['EMAIL', 'CALL', 'MEETING', 'NOTE'] as const
export const INTERACTION_DIRECTIONS = ['OUT', 'IN', 'NONE'] as const

export const INTERACTION_BODY_MAX_LENGTH = 20000
export const INTERACTION_SUBJECT_MAX_LENGTH = 500

const recipientSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: '' },
    status: { type: String, enum: ['SENT', 'FAILED'], required: true },
    error: { type: String, default: '' },
  },
  { _id: false },
)

/**
 * Un échange entre l'équipe et un interlocuteur — appel, rendez-vous, email ou
 * note. Distinct de LeadActivity et ClientActivity, qui consignent ce que le
 * système a fait ; ici on consigne ce que des humains se sont dit.
 */
const interactionSchema = new mongoose.Schema<IInteraction>(
  {
    subjectType: { type: String, enum: INTERACTION_SUBJECT_TYPES, required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: INTERACTION_KINDS, required: true },
    direction: { type: String, enum: INTERACTION_DIRECTIONS, default: 'NONE' },
    // Distinct de createdAt : un appel se consigne souvent après coup, et la
    // timeline doit le classer à sa date réelle.
    occurredAt: { type: Date, required: true, default: () => new Date() },
    subject: { type: String, default: '', trim: true, maxlength: INTERACTION_SUBJECT_MAX_LENGTH },
    body: { type: String, default: '', maxlength: INTERACTION_BODY_MAX_LENGTH },
    pinned: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recipients: { type: [recipientSchema], default: [] },
    deliveryStatus: {
      type: String,
      enum: ['NONE', 'SENT', 'PARTIAL', 'FAILED'],
      default: 'NONE',
    },
    // Pas de valeur par défaut : le champ doit rester ABSENT hors migration,
    // sinon l'index unique ci-dessous voit autant de `null` que de documents.
    migratedFrom: { type: String },
  },
  { timestamps: true },
)

interactionSchema.index({ subjectType: 1, subjectId: 1, occurredAt: -1 })
interactionSchema.index({ subjectType: 1, subjectId: 1, pinned: -1, occurredAt: -1 })
// Index partiel plutôt que sparse : sparse n'écarte que les documents où le
// champ est absent, et laisserait passer une collision entre deux `null`.
interactionSchema.index(
  { migratedFrom: 1 },
  { unique: true, partialFilterExpression: { migratedFrom: { $type: 'string' } } },
)

export default mongoose.model<IInteraction>('Interaction', interactionSchema)
