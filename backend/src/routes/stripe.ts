import express from 'express'
import type Stripe from 'stripe'
import { getStripeClient, requireStripe } from '../lib/stripe/client.js'
import { processStripeEvent } from '../lib/stripe/events.js'

const router = express.Router()
router.post('/webhook', requireStripe, express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const signature = req.headers['stripe-signature']
  let event: Stripe.Event
  try {
    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) throw new Error('Signature absente')
    event = getStripeClient().webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    res.status(400).json({ error: 'Signature Stripe absente, invalide ou trop ancienne.' })
    return
  }
  try {
    await processStripeEvent(event)
    res.json({ received: true })
  } catch {
    res.status(500).json({ error: 'Traitement Stripe temporairement indisponible.' })
  }
})
export default router
