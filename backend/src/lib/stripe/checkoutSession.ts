import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import ProjectPayment from '../../models/ProjectPayment.js'
import { getStripeClient, stripeConfigured } from './client.js'

function pendingPaymentError() {
  return Object.assign(
    new Error('Un paiement Stripe est en cours de rapprochement sur cette facture : attendez sa confirmation'),
    { status: 409 },
  )
}

/**
 * Ferme la session Checkout d'une facture. Une session déjà terminée dont le paiement a réussi
 * ou est encore en cours, sans encaissement enregistré, bloque l'appelant : sinon une seconde
 * session ou un encaissement manuel pourrait débiter deux fois le client avant le webhook.
 */
export async function expireCheckoutSession(id: string, reconcilingPaymentIntentId?: string): Promise<void> {
  const stripe = getStripeClient()
  let previous = await stripe.checkout.sessions.retrieve(id)
  if (previous.status === 'open') {
    try {
      await stripe.checkout.sessions.expire(id)
      return
    } catch (error) {
      // Un paiement peut terminer la session entre la lecture et l’expiration.
      previous = await stripe.checkout.sessions.retrieve(id)
      if (previous.status === 'open') throw error
    }
  }
  if (previous.status !== 'complete') return
  const paymentIntentId =
    typeof previous.payment_intent === 'string' ? previous.payment_intent : previous.payment_intent?.id
  if (!paymentIntentId || paymentIntentId === reconcilingPaymentIntentId) return
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (!['succeeded', 'processing', 'requires_capture'].includes(paymentIntent.status)) return
  if (paymentIntent.status === 'succeeded' && (await ProjectPayment.exists({ stripePaymentIntentId: paymentIntentId })))
    return
  throw pendingPaymentError()
}

export async function expireInvoiceCheckout(
  invoiceId: string,
  reconcilingPaymentIntentId?: string,
): Promise<string | null | undefined> {
  if (!stripeConfigured()) return
  const link = await InvoicePaymentLink.findOne({ invoice: invoiceId })
  if (link?.currentCheckoutSessionId)
    await expireCheckoutSession(link.currentCheckoutSessionId, reconcilingPaymentIntentId)
  return link?.currentCheckoutSessionId ?? null
}
