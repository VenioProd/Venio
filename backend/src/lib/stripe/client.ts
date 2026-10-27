import Stripe from 'stripe'
import type { RequestHandler } from 'express'

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.PUBLIC_APP_URL)
}

export const requireStripe: RequestHandler = (_req, res, next) => {
  if (!stripeConfigured()) {
    res.status(503).json({
      error: 'Paiement Stripe indisponible : configurez STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET et PUBLIC_APP_URL.',
    })
    return
  }
  next()
}

export function getStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 0 })
}

export function publicAppUrl(): string {
  const url = new URL(process.env.PUBLIC_APP_URL!)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PUBLIC_APP_URL invalide')
  }
  return url.origin
}
