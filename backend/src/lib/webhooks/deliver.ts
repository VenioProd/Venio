import type { Types } from 'mongoose'
import { computeSignature } from '../external/hmac.js'
import logger from '../logger.js'
import WebhookDelivery, { type WebhookDeliveryStatus } from '../../models/WebhookDelivery.js'
import WebhookEndpoint, { WEBHOOK_AUTO_DISABLE_THRESHOLD } from '../../models/WebhookEndpoint.js'
import { decryptWebhookSecret } from './secret.js'

/**
 * Livraison d'un événement vers un endpoint.
 *
 * Contrat (cf. docs/superpowers/specs/2026-08-26-pipeline-webhooks-kuro-design.md) :
 *   - POST JSON, timeout 10 s, aucune redirection suivie (3xx = échec).
 *   - Le corps est sérialisé UNE SEULE FOIS : le même string sert à signer et
 *     à envoyer, sinon la signature ne se recalcule pas côté récepteur.
 *   - Signature : sha256=HEX(HMAC(secret, `${timestamp}.${rawBody}`)), soit
 *     exactement la convention de lib/external/hmac.ts utilisée en entrant.
 *   - Échec → backoff 1 min / 5 min / 30 min / 2 h / 12 h, puis FAILED.
 *   - 20 échecs consécutifs sur un endpoint → auto-désactivation + alerte.
 */

export const WEBHOOK_BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const
export const WEBHOOK_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_BATCH = 50

export interface DeliveryOutcome {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
  status: WebhookDeliveryStatus
}

interface HttpAttemptResult {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
}

async function postSigned(
  url: string,
  secret: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<HttpAttemptResult> {
  const startedAt = Date.now()
  const timestamp = Math.floor(startedAt / 1000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-venio-timestamp': String(timestamp),
        'x-venio-signature': computeSignature(timestamp, rawBody, secret),
        ...headers,
      },
      body: rawBody,
      // Une 3xx est un échec : on ne suit jamais une redirection sortante.
      redirect: 'manual',
      signal: controller.signal,
    })
    const ok = response.status >= 200 && response.status < 300
    return {
      ok,
      httpStatus: response.status,
      error: ok ? '' : `HTTP ${response.status}`,
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    const message = (err as Error).name === 'AbortError' ? 'Timeout 10s' : (err as Error).message || 'Erreur réseau'
    return { ok: false, httpStatus: null, error: message.slice(0, 500), durationMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

async function registerSuccess(endpointId: Types.ObjectId): Promise<void> {
  await WebhookEndpoint.updateOne({ _id: endpointId }, { $set: { consecutiveFailures: 0, lastSuccessAt: new Date() } })
}

async function registerFailure(endpointId: Types.ObjectId, endpointName: string): Promise<void> {
  const updated = await WebhookEndpoint.findOneAndUpdate(
    { _id: endpointId },
    { $inc: { consecutiveFailures: 1 }, $set: { lastFailureAt: new Date() } },
    { new: true },
  )
  if (!updated || !updated.isActive) return
  if (updated.consecutiveFailures < WEBHOOK_AUTO_DISABLE_THRESHOLD) return

  await WebhookEndpoint.updateOne(
    { _id: endpointId },
    { $set: { isActive: false, disabledAt: new Date(), disabledReason: 'AUTO_FAILURES' } },
  )

  // Import dynamique : notifyHelpers → notifications → webhookEvents → ce
  // module. Le charger à l'exécution évite un cycle au chargement.
  const { notifySuperAdmins } = await import('../notifyHelpers.js')
  await notifySuperAdmins({
    type: 'WEBHOOK_ENDPOINT_DISABLED',
    title: `Webhook « ${endpointName} » désactivé`,
    message: `${WEBHOOK_AUTO_DISABLE_THRESHOLD} échecs consécutifs. Corrigez la destination puis réactivez l'endpoint.`,
    link: '/admin/webhooks',
    metadata: { endpointId: String(endpointId) },
  })
}

/**
 * Tente une livraison. Retourne null si la livraison n'existe pas ou n'est
 * plus en attente (déjà livrée ou épuisée).
 */
export async function attemptDelivery(deliveryId: string | Types.ObjectId): Promise<DeliveryOutcome | null> {
  const delivery = await WebhookDelivery.findById(deliveryId)
  if (!delivery || delivery.status !== 'PENDING') return null

  const endpoint = await WebhookEndpoint.findById(delivery.endpoint).select('+secretEncrypted')

  let attempt: HttpAttemptResult
  if (!endpoint) {
    attempt = { ok: false, httpStatus: null, error: 'Endpoint supprimé', durationMs: 0 }
  } else if (!endpoint.isActive) {
    attempt = { ok: false, httpStatus: null, error: 'Endpoint désactivé', durationMs: 0 }
  } else {
    const secret = decryptWebhookSecret(endpoint.secretEncrypted)
    if (!secret) {
      attempt = { ok: false, httpStatus: null, error: 'Secret illisible', durationMs: 0 }
    } else {
      attempt = await postSigned(endpoint.url, secret, JSON.stringify(delivery.payload), {
        'x-venio-event': delivery.eventType,
        'x-venio-delivery': String(delivery._id),
      })
    }
  }

  delivery.attempts.push({
    at: new Date(),
    httpStatus: attempt.httpStatus,
    error: attempt.error,
    durationMs: attempt.durationMs,
  })

  if (attempt.ok) {
    delivery.status = 'DELIVERED'
    delivery.nextRetryAt = null
  } else {
    const backoffMinutes = WEBHOOK_BACKOFF_MINUTES[delivery.attempts.length - 1]
    if (backoffMinutes === undefined) {
      delivery.status = 'FAILED'
      delivery.nextRetryAt = null
    } else {
      delivery.nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000)
    }
  }
  await delivery.save()

  // La santé de l'endpoint ne bouge que si la tentative a réellement été
  // émise : un endpoint désactivé ou supprimé n'accumule pas d'échecs.
  if (endpoint && endpoint.isActive) {
    if (attempt.ok) await registerSuccess(endpoint._id as Types.ObjectId)
    else await registerFailure(endpoint._id as Types.ObjectId, endpoint.name)
  }

  return { ...attempt, status: delivery.status }
}

/**
 * Reprend les livraisons en attente dont le retry est échu (lot borné).
 */
export async function processDueDeliveries(
  now: Date,
  limit: number = DEFAULT_RETRY_BATCH,
): Promise<{ processed: number; delivered: number; failed: number }> {
  const due = await WebhookDelivery.find({ status: 'PENDING', nextRetryAt: { $ne: null, $lte: now } })
    .sort({ nextRetryAt: 1 })
    .limit(limit)
    .select('_id')
    .lean()

  let delivered = 0
  let failed = 0
  const results = await Promise.allSettled(due.map((d) => attemptDelivery(d._id)))
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ data: { err: String(result.reason) } }, '[webhooks] retry en erreur')
      continue
    }
    if (result.value?.status === 'DELIVERED') delivered += 1
    else if (result.value?.status === 'FAILED') failed += 1
  }

  return { processed: due.length, delivered, failed }
}
