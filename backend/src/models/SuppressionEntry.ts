import mongoose, { Schema, type Types } from 'mongoose'

/**
 * Liste « ne pas contacter » globale du CRM (chantier 3D, RGPD).
 *
 * Une adresse inscrite ici ne reçoit plus aucun e-mail de prospection, quel que
 * soit le lead qui la porte : règles d'automatisation, envoi manuel depuis la
 * fiche. L'adresse est conservée (normalisée) parce qu'il faut pouvoir la
 * reconnaître : c'est la condition même du respect de l'opposition, et elle
 * survit à l'anonymisation du lead.
 *
 * Une entrée porte soit une adresse, soit un numéro (`phoneNormalized`, E.164) :
 * un numéro inscrit n'est plus composé depuis aucune fiche ni par aucun
 * commercial, et il est écarté de la file comme de l'import (lot téléphonie).
 */
export const SUPPRESSION_REASONS = ['UNSUBSCRIBE', 'MANUAL', 'OPPOSITION', 'ANONYMIZED'] as const
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number]

export interface ISuppressionEntry {
  _id: Types.ObjectId
  emailNormalized?: string
  phoneNormalized?: string
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
    emailNormalized: { type: String, trim: true, lowercase: true, maxlength: 320 },
    phoneNormalized: { type: String, trim: true, match: /^\+[1-9]\d{6,14}$/ },
    reason: { type: String, enum: [...SUPPRESSION_REASONS], default: 'MANUAL' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
  },
  { timestamps: true },
)

suppressionEntrySchema.pre('validate', function () {
  if (Boolean(this.emailNormalized) === Boolean(this.phoneNormalized))
    this.invalidate('emailNormalized', 'Une adresse ou un numéro, exactement un des deux')
})

// Index partiels : une entrée « numéro » n'a pas d'adresse, et inversement. L'ancien index
// non partiel sur l'adresse est remplacé par `ensurePhoneSuppressionIndexes` (migration 014).
suppressionEntrySchema.index(
  { emailNormalized: 1 },
  { unique: true, partialFilterExpression: { emailNormalized: { $type: 'string' } } },
)
suppressionEntrySchema.index(
  { phoneNormalized: 1 },
  { unique: true, partialFilterExpression: { phoneNormalized: { $type: 'string' } } },
)

export default mongoose.model<ISuppressionEntry>('SuppressionEntry', suppressionEntrySchema)
