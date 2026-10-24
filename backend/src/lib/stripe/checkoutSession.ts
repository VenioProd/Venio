import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import { getStripeClient, stripeConfigured } from './client.js'

export async function expireCheckoutSession(id: string): Promise<void> {
  const stripe = getStripeClient()
  const previous = await stripe.checkout.sessions.retrieve(id)
  if (previous.status !== 'open') return
  try {
    await stripe.checkout.sessions.expire(id)
  } catch (error) {
    // Un paiement peut terminer la session entre la lecture et l’expiration.
    if ((await stripe.checkout.sessions.retrieve(id)).status === 'open') throw error
  }
}

export async function expireInvoiceCheckout(invoiceId: string): Promise<string | null | undefined> {
  if (!stripeConfigured()) return
  const link = await InvoicePaymentLink.findOne({ invoice: invoiceId })
  if (link?.currentCheckoutSessionId) await expireCheckoutSession(link.currentCheckoutSessionId)
  return link?.currentCheckoutSessionId ?? null
}
