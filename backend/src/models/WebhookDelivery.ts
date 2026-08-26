import mongoose, { Schema, type Document, type Types } from 'mongoose'

/**
 * WebhookDelivery = une tentative de livraison d'un événement vers UN
 * endpoint. Un même événement logique (eventId partagé) produit une delivery
 * par endpoint abonné.
 *
 * Le payload est figé à l'émission : c'est le corps JSON exact envoyé, donc
 * un rejeu renvoie strictement la même chose.
 */

export const WEBHOOK_DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED'] as const
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

/** Rétention du journal des livraisons (purge Mongo automatique). */
export const WEBHOOK_DELIVERY_TTL_DAYS = 30

export interface IWebhookDeliveryAttempt {
  at: Date
  httpStatus: number | null
  error: string
  durationMs: number
}

export interface IWebhookDelivery extends Document {
  endpoint: Types.ObjectId
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempts: IWebhookDeliveryAttempt[]
  nextRetryAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const attemptSchema = new Schema<IWebhookDeliveryAttempt>(
  {
    at: { type: Date, required: true },
    httpStatus: { type: Number, default: null },
    error: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false },
)

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    endpoint: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: WEBHOOK_DELIVERY_STATUSES, default: 'PENDING' },
    attempts: { type: [attemptSchema], default: [] },
    nextRetryAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// Journal par endpoint, du plus récent au plus ancien.
webhookDeliverySchema.index({ endpoint: 1, createdAt: -1 })
// Reprise par le job de retry : PENDING dont nextRetryAt est échu.
webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 })
// Corrélation des livraisons d'un même événement (rejeu inclus).
webhookDeliverySchema.index({ eventId: 1 })
// Purge automatique après 30 jours.
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: WEBHOOK_DELIVERY_TTL_DAYS * 24 * 60 * 60 })

export default mongoose.model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema)
