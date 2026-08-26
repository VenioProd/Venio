import crypto from 'crypto'
import type { NotificationType } from '../types/enums.js'
import logger from './logger.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { attemptDelivery } from './webhooks/deliver.js'

/**
 * Point d'entrée du pipeline sortant : transforme un événement de
 * notification en une livraison par endpoint abonné.
 *
 * Règles d'émission (cf. spec) — appliquées par les APPELANTS :
 *   1. createNotification({ skipWebhook: true }) n'émet jamais.
 *   2. Les broadcasts de notifyHelpers émettent UNE fois, inconditionnellement.
 *   3. createNotification direct sans dedupeKey émet après la tentative de
 *      création, même si la préférence in-app a bloqué la ligne.
 *   4. createNotification direct avec dedupeKey n'émet que si une ligne a été
 *      créée (une mise à jour d'alerte non lue ne réémet rien).
 *
 * Règle appliquée ICI : anti-boucle. Un événement WEBHOOK_* ne repart jamais
 * dans le pipeline, sinon un endpoint en panne s'auto-alimente.
 */

export interface WebhookEventInput {
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
}

export interface EmittedWebhookEvent {
  eventId: string
  deliveryIds: string[]
}

function isLoopType(type: string): boolean {
  return type.startsWith('WEBHOOK_')
}

export function buildWebhookPayload(
  eventId: string,
  input: WebhookEventInput,
  occurredAt: Date,
): Record<string, unknown> {
  return {
    id: eventId,
    type: input.type,
    occurredAt: occurredAt.toISOString(),
    title: input.title,
    message: input.message || '',
    link: input.link || '',
    metadata: input.metadata || {},
  }
}

/**
 * Crée les livraisons (awaité) puis déclenche les tentatives HTTP sans les
 * attendre. Retourne null si le type est exclu du pipeline.
 */
export async function emitWebhookEvent(input: WebhookEventInput): Promise<EmittedWebhookEvent | null> {
  if (isLoopType(input.type)) return null

  const endpoints = await WebhookEndpoint.find({
    isActive: true,
    $or: [{ eventTypes: { $size: 0 } }, { eventTypes: input.type }],
  })
    .select('_id')
    .lean()

  const eventId = crypto.randomUUID()
  if (endpoints.length === 0) return { eventId, deliveryIds: [] }

  const payload = buildWebhookPayload(eventId, input, new Date())
  const deliveries = await WebhookDelivery.insertMany(
    endpoints.map((endpoint) => ({
      endpoint: endpoint._id,
      eventId,
      eventType: input.type,
      payload,
    })),
  )

  // Fire-and-forget : l'appelant métier ne doit jamais attendre le réseau.
  void Promise.allSettled(deliveries.map((delivery) => attemptDelivery(delivery._id)))

  return { eventId, deliveryIds: deliveries.map((delivery) => String(delivery._id)) }
}

/** Variante non bloquante pour les points d'émission métier. */
export function emitWebhookEventInBackground(input: WebhookEventInput): void {
  void emitWebhookEvent(input).catch((err) => {
    logger.warn({ data: { type: input.type, err: (err as Error).message } }, '[webhooks] emission fail')
  })
}
