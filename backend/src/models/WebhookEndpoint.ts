import mongoose, { Schema, type Document, type Types } from 'mongoose'

/**
 * WebhookEndpoint = un consommateur externe (Kuro en premier) abonné aux
 * événements sortants de Venio.
 *
 * Sécurité :
 *   - secretEncrypted : secret HMAC chiffré via lib/secretBox. Contrairement
 *     aux tokens entrants (hashés), il doit rester déchiffrable pour signer
 *     chaque envoi. Affiché en clair UNE SEULE FOIS à la création/rotation.
 *   - eventTypes vide = tous les types de notification.
 */

export const WEBHOOK_DISABLED_REASONS = ['AUTO_FAILURES', 'MANUAL'] as const
export type WebhookDisabledReason = (typeof WEBHOOK_DISABLED_REASONS)[number]

/** Nombre d'échecs consécutifs au-delà duquel l'endpoint s'auto-désactive. */
export const WEBHOOK_AUTO_DISABLE_THRESHOLD = 20

export interface IWebhookEndpoint extends Document {
  name: string
  url: string
  secretEncrypted: string
  eventTypes: string[]
  isActive: boolean
  consecutiveFailures: number
  disabledAt: Date | null
  disabledReason: WebhookDisabledReason | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  createdBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const webhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    secretEncrypted: { type: String, required: true, select: false },
    eventTypes: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, enum: [...WEBHOOK_DISABLED_REASONS, null], default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

// Résolution des destinataires à chaque émission : filtre sur isActive.
webhookEndpointSchema.index({ isActive: 1 })

export default mongoose.model<IWebhookEndpoint>('WebhookEndpoint', webhookEndpointSchema)
