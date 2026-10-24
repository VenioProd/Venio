import mongoose, { type ClientSession, type Types } from 'mongoose'
import type Stripe from 'stripe'
import StripeEvent from '../../models/StripeEvent.js'
import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectPayment from '../../models/ProjectPayment.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import { createEntry } from '../accounting/doubleEntry.js'
import { recordPayment, recordRefund } from '../projectFinance/payments.js'
import { runInTransaction } from '../transaction.js'
import { getStripeClient } from './client.js'
import { expireInvoiceCheckout } from './checkoutSession.js'

class ReviewError extends Error {}
function requireBusiness(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ReviewError(message)
}
function positiveCents(value: number) {
  requireBusiness(Number.isSafeInteger(value) && value > 0, 'Montant Stripe invalide')
}
function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id
}
type Result = { status: 'PROCESSED' | 'IGNORED'; invoice?: Types.ObjectId; payment?: Types.ObjectId }
type Operation = (session: ClientSession) => Promise<Result>
function eventObjectId(event: Stripe.Event) {
  const object = event.data.object
  return 'id' in object ? object.id : null
}

async function paymentOperation(event: Stripe.Event): Promise<Operation> {
  const checkout = event.data.object as Stripe.Checkout.Session
  if (event.type === 'checkout.session.completed' && checkout.payment_status !== 'paid') {
    return async () => ({ status: 'IGNORED' })
  }
  const id = objectId(checkout.payment_intent)
  requireBusiness(id, 'PaymentIntent absent de la session')
  const stripe = getStripeClient()
  const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge.balance_transaction'] })
  requireBusiness(pi.id === id && pi.status === 'succeeded', 'PaymentIntent non réussi')
  requireBusiness(pi.currency === 'eur', 'Devise du PaymentIntent différente de l’euro')
  positiveCents(pi.amount_received)
  const invoiceId = pi.metadata.invoiceId
  const linkId = pi.metadata.linkId
  requireBusiness(
    mongoose.isValidObjectId(invoiceId) && mongoose.isValidObjectId(linkId),
    'Métadonnées facture ou lien absentes ou invalides',
  )
  requireBusiness(
    checkout.metadata?.invoiceId === invoiceId && checkout.metadata?.linkId === linkId,
    'Métadonnées session et PaymentIntent incohérentes',
  )
  let charge = pi.latest_charge
  if (typeof charge === 'string') charge = await stripe.charges.retrieve(charge, { expand: ['balance_transaction'] })
  requireBusiness(
    charge && objectId(charge.payment_intent) === pi.id && charge.currency === 'eur',
    'Charge Stripe incohérente',
  )
  const balance = charge.balance_transaction
  if (!balance || typeof balance === 'string') throw new Error('Transaction de solde Stripe indisponible')
  requireBusiness(balance.currency === 'eur', 'Devise de la commission différente de l’euro')
  requireBusiness(
    Number.isSafeInteger(balance.fee) && balance.fee >= 0 && balance.fee <= pi.amount_received,
    'Commission Stripe incohérente',
  )
  requireBusiness(
    balance.amount === pi.amount_received && balance.net === pi.amount_received - balance.fee,
    'Transaction de solde et montant encaissé incohérents',
  )
  const stripeInput = { paymentIntentId: pi.id, chargeId: charge.id, feeCents: balance.fee }
  const expiredCheckoutSessionId = await expireInvoiceCheckout(invoiceId)
  return async (session) => {
    const link = await InvoicePaymentLink.findById(linkId).session(session)
    requireBusiness(link && String(link.invoice) === invoiceId, 'Lien Stripe sans facture correspondante')
    const invoice = await BillingDocument.findById(invoiceId).session(session)
    requireBusiness(invoice, 'Facture Stripe introuvable')
    requireBusiness(invoice.currency === 'EUR', 'Devise de la facture différente de l’euro')
    const result = await recordPayment(
      {
        invoiceId,
        amountTtcCents: pi.amount_received,
        receivedAt: new Date(pi.created * 1000),
        method: 'STRIPE',
        reference: pi.id,
        stripe: stripeInput,
        idempotencyKey: `stripe:pi:${pi.id}`,
        userId: String(invoice.createdBy),
      },
      { session, expiredCheckoutSessionId },
    )
    return {
      status: 'PROCESSED',
      invoice: invoice._id as Types.ObjectId,
      payment: result.payment._id as Types.ObjectId,
    }
  }
}

async function refundOperation(event: Stripe.Event): Promise<Operation> {
  const stripe = getStripeClient()
  const id = eventObjectId(event)
  requireBusiness(id, 'Identifiant Stripe absent')
  let chargeId: string | undefined
  if (event.type === 'charge.refunded') chargeId = id
  else {
    const refund = await stripe.refunds.retrieve(id)
    if (refund.status !== 'succeeded') return async () => ({ status: 'IGNORED' })
    chargeId = objectId(refund.charge)
  }
  requireBusiness(chargeId, 'Charge du remboursement introuvable')
  const charge = await stripe.charges.retrieve(chargeId)
  const piId = objectId(charge.payment_intent)
  requireBusiness(
    charge.id === chargeId && charge.currency === 'eur' && piId,
    'Charge remboursée incohérente ou hors euro',
  )
  const refunds: Stripe.Refund[] = []
  for await (const refund of stripe.refunds.list({ charge: chargeId, limit: 100 })) {
    if (refund.status !== 'succeeded') continue
    requireBusiness(
      refund.currency === 'eur' && objectId(refund.charge) === chargeId && objectId(refund.payment_intent) === piId,
      'Remboursement Stripe incohérent ou hors euro',
    )
    positiveCents(refund.amount)
    refunds.push(refund)
  }
  refunds.sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))
  return async (session) => {
    const original = await ProjectPayment.findOne({
      stripePaymentIntentId: piId,
      kind: 'PAYMENT',
      source: 'STRIPE',
    }).session(session)
    requireBusiness(original && original.stripeChargeId === chargeId, 'Encaissement Stripe d’origine introuvable')
    let payment = original._id as Types.ObjectId
    for (const refund of refunds) {
      const result = await recordRefund(
        {
          paymentId: String(original._id),
          amountTtcCents: refund.amount,
          receivedAt: new Date(refund.created * 1000),
          reason: 'Remboursement Stripe',
          idempotencyKey: `stripe:re:${refund.id}`,
          userId: String(original.createdBy),
        },
        session,
      )
      payment = result.payment._id as Types.ObjectId
    }
    return { status: 'PROCESSED', invoice: original.invoice, payment }
  }
}

async function payoutOperation(event: Stripe.Event): Promise<Operation> {
  const id = eventObjectId(event)
  requireBusiness(id, 'Identifiant du virement absent')
  const payout = await getStripeClient().payouts.retrieve(id)
  requireBusiness(payout.id === id && payout.status === 'paid', 'Virement Stripe non payé')
  requireBusiness(payout.currency === 'eur', 'Devise du virement différente de l’euro')
  positiveCents(payout.amount)
  return async (session) => {
    const key = `stripe:payout:${payout.id}`
    if (await AccountingEntry.exists({ idempotencyKey: key }).session(session)) return { status: 'PROCESSED' }
    await createEntry({
      journal: 'BQ',
      date: new Date(payout.arrival_date * 1000),
      label: `Virement Stripe ${payout.id}`,
      lines: [
        { account: '512000', debit: payout.amount / 100 },
        { account: '512800', credit: payout.amount / 100 },
      ],
      source: 'PAYMENT',
      idempotencyKey: key,
      status: 'VALIDATED',
      session,
    })
    return { status: 'PROCESSED' }
  }
}

async function prepare(event: Stripe.Event): Promise<Operation> {
  if (event.type.startsWith('charge.dispute.'))
    throw new ReviewError('Contestation Stripe à traiter dans le tableau de bord Stripe')
  if (event.type === 'payout.failed') throw new ReviewError('Virement Stripe échoué')
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
    return paymentOperation(event)
  if (['charge.refunded', 'charge.refund.updated', 'refund.updated'].includes(event.type)) return refundOperation(event)
  if (event.type === 'payout.paid') return payoutOperation(event)
  return async () => ({ status: 'IGNORED' })
}

function reviewReason(error: unknown): string | undefined {
  if (error instanceof ReviewError) return error.message
  if (error instanceof mongoose.Error.CastError || error instanceof mongoose.Error.ValidationError)
    return 'Données comptables invalides'
  if (error instanceof Error && [400, 404, 409, 423].includes((error as Error & { status?: number }).status ?? 0))
    return error.message
  if (error && typeof error === 'object' && 'code' in error && error.code === 'resource_missing')
    return 'Objet Stripe introuvable'
}

export async function processStripeEvent(event: Stripe.Event) {
  const done = await StripeEvent.findOne({ eventId: event.id, status: { $in: ['PROCESSED', 'IGNORED'] } })
  if (done) return done
  const persist = async (session: ClientSession, result: Result | { status: 'NEEDS_REVIEW'; reason: string }) => {
    return StripeEvent.findOneAndUpdate(
      { eventId: event.id },
      {
        $set: { type: event.type, objectId: eventObjectId(event), reason: '', processedAt: new Date(), ...result },
        $inc: { attempts: 1 },
      },
      { upsert: true, new: true, session },
    )
  }
  const execute = async () => {
    try {
      const operation = await prepare(event)
      return await runInTransaction(async (session) => {
        const existing = await StripeEvent.findOne({ eventId: event.id }).session(session)
        if (existing && existing.status !== 'NEEDS_REVIEW') return existing
        if (
          event.type !== 'checkout.session.completed' ||
          (event.data.object as Stripe.Checkout.Session).payment_status === 'paid'
        ) {
          if (
            [
              'payout.paid',
              'charge.refunded',
              'charge.refund.updated',
              'refund.updated',
              'checkout.session.completed',
              'checkout.session.async_payment_succeeded',
            ].includes(event.type)
          ) {
            requireBusiness(
              await ChartOfAccount.exists({ code: '512800', isActive: true }).session(session),
              'Compte 512800 absent ou inactif : initialisez le plan comptable',
            )
          }
        }
        return persist(session, await operation(session))
      })
    } catch (error) {
      const reason = reviewReason(error)
      if (!reason) throw error
      return runInTransaction(async (session) => {
        const existing = await StripeEvent.findOne({ eventId: event.id }).session(session)
        if (existing && existing.status !== 'NEEDS_REVIEW') return existing
        const object = event.data.object
        let invoice: Types.ObjectId | undefined
        if ('metadata' in object && object.metadata && mongoose.isValidObjectId(object.metadata.invoiceId)) {
          invoice = new mongoose.Types.ObjectId(object.metadata.invoiceId)
        }
        return persist(session, { status: 'NEEDS_REVIEW', reason, ...(invoice && { invoice }) })
      })
    }
  }
  return execute().catch((error: unknown) => {
    if ((error as { code?: number }).code !== 11000) throw error
    return execute()
  })
}
