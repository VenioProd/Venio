import mongoose, { Schema, type Types } from 'mongoose'

/**
 * Liste « ne pas contacter » globale du CRM (chantier 3D, RGPD).
 *
 * Une adresse inscrite ici ne reçoit plus aucun e-mail de prospection, quel que
 * soit le lead qui la porte : règles d'automatisation, envoi manuel depuis la
 * fiche. L'adresse est conservée (normalisée) parce qu'il faut pouvoir la
 * reconnaître : c'est la condition même du respect de l'opposition, et elle
 * survit à l'anonymisation du lead.
 */
export const SUPPRESSION_REASONS = ['UNSUBSCRIBE', 'MANUAL', 'OPPOSITION', 'ANONYMIZED'] as const
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number]

export interface ISuppressionEntry {
  _id: Types.ObjectId
  emailNormalized: string
  reason: SuppressionReason
  /** Utilisateur à l'origine de l'inscription ; `null` pour la personne elle-même (lien de désinscription) ou le système. */
  createdBy: Types.ObjectId | null
  /** Lead d'où vient l'inscription, pour la traçabilité (peut avoir été anonymisé depuis). */
  leadId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const suppressionEntrySchema = new Schema<ISuppressionEntry>(
  {
    emailNormalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    reason: { type: String, enum: [...SUPPRESSION_REASONS], default: 'MANUAL' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
  },
  { timestamps: true },
)

suppressionEntrySchema.index({ emailNormalized: 1 }, { unique: true })

export default mongoose.model<ISuppressionEntry>('SuppressionEntry', suppressionEntrySchema)
