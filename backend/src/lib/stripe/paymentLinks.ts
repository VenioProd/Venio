import { createHash, randomBytes } from 'node:crypto'
import mongoose, { type ClientSession } from 'mongoose'
import type Stripe from 'stripe'
import BillingDocument from '../../models/BillingDocument.js'
import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import User from '../../models/User.js'
import Subsidiary from '../../models/Subsidiary.js'
import type { IBillingDocument } from '../../types/models/index.js'
import { decryptSecret, encryptSecret } from '../secretBox.js'
import { runInTransaction } from '../transaction.js'
import { invoicePaymentBalance } from '../projectFinance/payments.js'
import { getStripeClient, publicAppUrl, stripeConfigured } from './client.js'
import { expireCheckoutSession } from './checkoutSession.js'

export function linkError(message: string, status = 409) {
  return Object.assign(new Error(message), { status })
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function payableInvoice(invoiceId: string, session: ClientSession | null = null) {
  if (!mongoose.isValidObjectId(invoiceId)) throw linkError('Facture introuvable', 404)
  const invoice = await BillingDocument.findById(invoiceId).session(session)
  if (!invoice) throw linkError('Facture introuvable', 404)
  if (
    invoice.type !== 'INVOICE' ||
    invoice.total <= 0 ||
    invoice.creditedInvoice ||
    ['DRAFT', 'CANCELLED'].includes(invoice.status)
  ) {
    throw linkError('Le paiement exige une facture positive émise et non annulée')
  }
  if (invoice.currency !== 'EUR') throw linkError('Seuls les paiements en euros sont acceptés')
  const balance = await invoicePaymentBalance(invoice, session)
  if (balance.historical) throw linkError('Facture historique : utilisez une écriture manuelle')
  if (balance.remainingTtcCents <= 0) throw linkError('Cette facture est soldée')
  if (await BillingDocument.exists({ creditedInvoice: invoice._id, status: 'DRAFT' }).session(session)) {
    throw linkError('Un avoir en brouillon empêche le paiement')
  }
  return { invoice, remainingTtcCents: balance.remainingTtcCents }
}

export async function paymentLinkUrl(invoice: IBillingDocument): Promise<string | undefined> {
  if (
    !stripeConfigured() ||
    invoice.type !== 'INVOICE' ||
    invoice.total <= 0 ||
    ['DRAFT', 'CANCELLED'].includes(invoice.status)
  )
    return
  const link = await InvoicePaymentLink.findOne({ invoice: invoice._id, revokedAt: null })
  if (!link || (await invoicePaymentBalance(invoice, null)).remainingTtcCents <= 0) return
  const token = decryptSecret(link.tokenEncrypted)
  if (!token || hash(token) !== link.tokenHash) throw linkError('Lien de paiement illisible', 503)
  return `${publicAppUrl()}/payer/${token}`
}

export async function renewPaymentLink(invoiceId: string, userId: string) {
  // Sans clé dédiée, secretBox retombe sur une valeur connue : le jeton serait lisible dans une copie de la base.
  if (!process.env.CREDENTIALS_KEY) throw linkError('Liens de paiement indisponibles : configurez CREDENTIALS_KEY', 503)
  await payableInvoice(invoiceId)
  const previous = await InvoicePaymentLink.findOne({ invoice: invoiceId })
  if (previous?.currentCheckoutSessionId) await expireCheckoutSession(previous.currentCheckoutSessionId)
  const token = randomBytes(32).toString('base64url')
  await runInTransaction(async (session) => {
    await BillingDocument.updateOne({ _id: invoiceId }, { $currentDate: { updatedAt: true } }, { session })
    await payableInvoice(invoiceId, session)
    const current = await InvoicePaymentLink.findOne({ invoice: invoiceId }).session(session)
    if (
      String(current?._id) !== String(previous?._id) ||
      current?.updatedAt.getTime() !== previous?.updatedAt.getTime()
    ) {
      throw linkError('Le lien a changé, actualisez avant de le renouveler')
    }
    await InvoicePaymentLink.findOneAndUpdate(
      { invoice: invoiceId },
      {
        $set: {
          tokenHash: hash(token),
          tokenEncrypted: encryptSecret(token),
          revokedAt: null,
          currentCheckoutSessionId: null,
          createdBy: userId,
        },
      },
      { upsert: true, session },
    )
  })
  return `${publicAppUrl()}/payer/${token}`
}

export async function revokePaymentLink(invoiceId: string) {
  const link = await InvoicePaymentLink.findOne({ invoice: invoiceId })
  if (!link) return
  if (link.currentCheckoutSessionId) await expireCheckoutSession(link.currentCheckoutSessionId)
  const result = await InvoicePaymentLink.updateOne(
    { _id: link._id, tokenHash: link.tokenHash, updatedAt: link.updatedAt },
    { $set: { revokedAt: new Date() } },
  )
  if (!result.matchedCount) throw linkError('Le lien a changé, actualisez avant de le révoquer')
}

async function findPublicLink(token: string) {
  const link = await InvoicePaymentLink.findOne({ tokenHash: hash(token) })
  if (!link) throw linkError('Lien introuvable', 404)
  if (link.revokedAt) throw linkError('Ce lien de paiement a été révoqué')
  return link
}

export async function publicInvoice(token: string) {
  const link = await findPublicLink(token)
  const { invoice, remainingTtcCents } = await payableInvoice(String(link.invoice))
  let payerName = invoice.payer?.billingContact.name
  if (!payerName && invoice.payer?.kind === 'SUBSIDIARY')
    payerName = (await Subsidiary.findById(invoice.payer.subsidiary).select('name'))?.name
  if (!payerName) payerName = (await User.findById(invoice.payer?.user ?? invoice.client).select('name'))?.name
  return { number: invoice.number, payerName: payerName || 'Payeur', remainingTtcCents }
}

export async function createCheckout(token: string) {
  const link = await findPublicLink(token)
  const { invoice, remainingTtcCents } = await payableInvoice(String(link.invoice))
  if (link.currentCheckoutSessionId) await expireCheckoutSession(link.currentCheckoutSessionId)
  const metadata = { invoiceId: String(invoice._id), linkId: String(link._id) }
  const stripe = getStripeClient()
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: remainingTtcCents,
          product_data: { name: `Facture ${invoice.number}` },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    success_url: `${publicAppUrl()}/payer/succes`,
    cancel_url: `${publicAppUrl()}/payer/${token}/annulation`,
  }
  const key = `checkout:${link._id}:${hash(`${link.tokenHash}:${link.currentCheckoutSessionId ?? ''}:${remainingTtcCents}`)}`
  let checkout = await stripe.checkout.sessions.create(params, { idempotencyKey: key })
  let state = await stripe.checkout.sessions.retrieve(checkout.id)
  if (state.status === 'expired') {
    checkout = await stripe.checkout.sessions.create(params, { idempotencyKey: `${key}:after:${checkout.id}` })
    state = await stripe.checkout.sessions.retrieve(checkout.id)
  }
  try {
    if (state.status !== 'open') throw linkError('La session Stripe est déjà terminée, rechargez la page')
    if (!checkout.url) throw linkError('Stripe n’a pas fourni de lien de paiement', 502)
    await runInTransaction(async (session) => {
      await BillingDocument.updateOne({ _id: invoice._id }, { $currentDate: { updatedAt: true } }, { session })
      const current = await InvoicePaymentLink.findById(link._id).session(session)
      const fresh = await payableInvoice(String(invoice._id), session)
      if (fresh.remainingTtcCents !== remainingTtcCents)
        throw linkError('Le reste dû a changé, rechargez la page de paiement')
      if (
        current?.currentCheckoutSessionId === checkout.id &&
        !current.revokedAt &&
        current.tokenHash === link.tokenHash
      )
        return
      if (
        !current ||
        current.revokedAt ||
        current.tokenHash !== link.tokenHash ||
        current.currentCheckoutSessionId !== link.currentCheckoutSessionId ||
        current.updatedAt.getTime() !== link.updatedAt.getTime()
      ) {
        throw linkError('Le lien a changé, rechargez la page de paiement')
      }
      current.currentCheckoutSessionId = checkout.id
      await current.save({ session })
    })
    return checkout.url
  } catch (error) {
    await expireCheckoutSession(checkout.id)
    await InvoicePaymentLink.updateOne(
      {
        _id: link._id,
        tokenHash: link.tokenHash,
        currentCheckoutSessionId: link.currentCheckoutSessionId,
        updatedAt: link.updatedAt,
      },
      { $set: { currentCheckoutSessionId: checkout.id } },
    )
    throw error
  }
}
