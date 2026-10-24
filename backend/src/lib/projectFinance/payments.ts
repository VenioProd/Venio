import { createHash } from 'node:crypto'
import { type ClientSession, type Types } from 'mongoose'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectPayment from '../../models/ProjectPayment.js'
import ShareAllocation from '../../models/ShareAllocation.js'
import ProjectFinance from '../../models/ProjectFinance.js'
import ShareRuleVersion from '../../models/ShareRuleVersion.js'
import ShareSettlement from '../../models/ShareSettlement.js'
import InvoicePaymentLink from '../../models/InvoicePaymentLink.js'
import type { IBillingDocument, IFinancePayer } from '../../types/models/index.js'
import { createEntry, type CreateEntryLineInput } from '../accounting/doubleEntry.js'
import { resolveBankAccount } from '../accounting/paymentToEntry.js'
import { notifySuperAdmins } from '../notifyHelpers.js'
import { runInTransaction } from '../transaction.js'
import { invoiceAmountsCents } from './invoicing.js'
import { assertCents, moneyError, toCents } from './money.js'
import { allocatePayment, beneficiaryStatement, cumulativeHt, refundRegularisation, ruleVersionAt } from './rules.js'
import { projectCostLines } from './settlements.js'
import { expireInvoiceCheckout } from '../stripe/checkoutSession.js'

function conflict(message: string) {
  const error = moneyError(message)
  error.status = 409
  return error
}

export async function invoicePaymentBalance(invoice: IBillingDocument, session: ClientSession | null) {
  const amounts = invoiceAmountsCents(invoice)
  const credits = await BillingDocument.find({
    creditedInvoice: invoice._id,
    status: { $nin: ['DRAFT', 'CANCELLED'] },
  }).session(session)
  let htCents = amounts.htCents
  let ttcCents = amounts.ttcCents
  for (const credit of credits) {
    const credited = invoiceAmountsCents(credit)
    htCents += credited.htCents
    ttcCents += credited.ttcCents
  }
  const payments = await ProjectPayment.find({ invoice: invoice._id }).session(session)
  const historical = invoice.status === 'PAID' && payments.length === 0
  let receivedTtcCents = payments.reduce((sum, payment) => sum + payment.amountTtcCents, 0)
  if (historical) receivedTtcCents = ttcCents
  assertCents(htCents)
  assertCents(ttcCents)
  assertCents(receivedTtcCents)
  return { htCents, ttcCents, receivedTtcCents, remainingTtcCents: ttcCents - receivedTtcCents, historical, payments }
}

export async function assertInvoiceHasNoReceipts(invoice: IBillingDocument, session: ClientSession | null) {
  const balance = await invoicePaymentBalance(invoice, session)
  if (balance.historical) throw conflict('Facture payée sans encaissement détaillé : utilisez une écriture manuelle')
  if (balance.receivedTtcCents !== 0)
    throw conflict('Remboursez les encaissements de la facture avant de créer ou émettre un avoir ou de l’annuler')
}

interface MovementInput {
  amountTtcCents: number
  receivedAt: Date | string
  idempotencyKey: string
  userId: string
}
interface PaymentInput extends MovementInput {
  invoiceId: string
  method: IFinancePayer['paymentMethod']
  reference?: string
  stripe?: { paymentIntentId: string; chargeId: string; feeCents: number }
}
interface RefundInput extends MovementInput {
  paymentId: string
  reason: string
}
type Movement = ({ kind: 'PAYMENT' } & PaymentInput) | ({ kind: 'REFUND' } & RefundInput)

async function recordMovement(
  input: Movement,
  transactionSession?: ClientSession,
  expiredCheckoutSessionId?: string | null,
) {
  if (!(input.receivedAt instanceof Date) && (typeof input.receivedAt !== 'string' || !input.receivedAt.trim())) {
    throw moneyError('La date d’encaissement est requise')
  }
  const receivedAt = new Date(input.receivedAt)
  if (!Number.isFinite(receivedAt.getTime())) throw moneyError('Date d’encaissement invalide')
  if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim())
    throw moneyError('La clé d’idempotence est requise')
  const request = {
    kind: input.kind,
    amountTtcCents: input.amountTtcCents,
    receivedAt: receivedAt.toISOString(),
    userId: input.userId,
    ...(input.kind === 'PAYMENT'
      ? {
          invoiceId: input.invoiceId,
          method: input.method,
          reference: input.reference ?? '',
          ...(input.stripe && { stripe: input.stripe }),
        }
      : { paymentId: input.paymentId, reason: input.reason }),
  }
  const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
  const operation = async (session: ClientSession) => {
    const existing = await ProjectPayment.findOne({ idempotencyKey: input.idempotencyKey }).session(session)
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict('Cette clé d’idempotence désigne une autre demande')
      return { payment: existing, alreadyExisted: true, paidInvoice: null }
    }
    const original = input.kind === 'REFUND' ? await ProjectPayment.findById(input.paymentId).session(session) : null
    if (input.kind === 'REFUND' && (!original || original.kind !== 'PAYMENT'))
      throw conflict('Le remboursement doit imputer un encaissement positif existant')
    if (original?.source === 'STRIPE' && !transactionSession) {
      throw conflict('Effectuez le remboursement dans Stripe : seul son webhook peut l’enregistrer')
    }
    const invoiceId = input.kind === 'PAYMENT' ? input.invoiceId : original!.invoice
    // L’écriture force les demandes concurrentes à relire le cumul après le commit.
    await BillingDocument.updateOne({ _id: invoiceId }, { $currentDate: { updatedAt: true } }, { session })
    const invoice = await BillingDocument.findById(invoiceId).session(session)
    if (!invoice) {
      const error = moneyError('Facture introuvable')
      error.status = 404
      throw error
    }
    if (expiredCheckoutSessionId !== undefined) {
      const link = await InvoicePaymentLink.findOneAndUpdate(
        { invoice: invoiceId },
        { $currentDate: { updatedAt: true } },
        { session, new: true },
      )
      if ((link?.currentCheckoutSessionId ?? null) !== expiredCheckoutSessionId) {
        throw conflict('Une nouvelle session de paiement a été ouverte : actualisez avant d’encaisser')
      }
    }
    if (
      invoice.type !== 'INVOICE' ||
      invoice.total <= 0 ||
      invoice.creditedInvoice ||
      ['DRAFT', 'CANCELLED'].includes(invoice.status)
    ) {
      throw conflict('Un encaissement exige une facture positive émise')
    }
    const balance = await invoicePaymentBalance(invoice, session)
    if (balance.historical) throw conflict('Facture payée sans encaissement détaillé : utilisez une écriture manuelle')
    if (await BillingDocument.exists({ creditedInvoice: invoice._id, status: 'DRAFT' }).session(session)) {
      throw conflict('Un avoir en brouillon empêche les encaissements de cette facture')
    }
    assertCents(input.amountTtcCents, 'Montant TTC')
    if (input.amountTtcCents <= 0) throw moneyError('Le montant TTC doit être strictement positif')
    if (receivedAt.getTime() > Date.now()) throw moneyError('La date d’encaissement ne peut pas être dans le futur')
    if (input.kind === 'REFUND' && (typeof input.reason !== 'string' || !input.reason.trim()))
      throw moneyError('Le motif du remboursement est requis')
    const amountTtcCents = input.kind === 'PAYMENT' ? input.amountTtcCents : -input.amountTtcCents
    const after = balance.receivedTtcCents + amountTtcCents
    assertCents(after, 'Cumul encaissé')
    if (after < 0 || after > balance.ttcCents)
      throw conflict('Le montant dépasse le reste dû ou le cumul encaissé de la facture')
    const htCents =
      cumulativeHt(after, balance.htCents, balance.ttcCents) -
      cumulativeHt(balance.receivedTtcCents, balance.htCents, balance.ttcCents)
    let selectedVersion = null
    let allocation
    if (original) {
      const refunds = balance.payments.filter((payment) => String(payment.refundOf) === String(original._id))
      const remaining = original.amountTtcCents + refunds.reduce((sum, payment) => sum + payment.amountTtcCents, 0)
      if (input.amountTtcCents > remaining)
        throw conflict('Le remboursement dépasse le TTC restant de l’encaissement imputé')
      if (original.ruleVersion) {
        selectedVersion = await ShareRuleVersion.findById(original.ruleVersion).session(session)
        if (!selectedVersion) throw conflict('Version de répartition de l’encaissement introuvable')
      }
      const rules = (selectedVersion?.rules ?? []).map((rule) => ({ key: String(rule.beneficiary), bp: rule.bp }))
      if (input.amountTtcCents === remaining) {
        const rows = await ShareAllocation.find({
          payment: { $in: [original._id, ...refunds.map((payment) => payment._id)] },
        }).session(session)
        const beneficiaries = rules.map((rule) => ({
          key: rule.key,
          cents:
            0 -
            rows.filter((row) => String(row.beneficiary) === rule.key).reduce((sum, row) => sum + row.amountCents, 0),
        }))
        allocation = {
          beneficiaries,
          companyCents: htCents - beneficiaries.reduce((sum, part) => sum + part.cents, 0),
        }
      } else {
        // Le centime déjà porté par la société ne réduit pas la base des bénéficiaires sous zéro.
        const base = Math.max(0, original.htCents + refunds.reduce((sum, payment) => sum + payment.htCents, 0))
        const regularised = Math.min(Math.abs(htCents), base)
        const excess = Math.abs(htCents) - regularised
        if (excess > 2 || regularised < 0) throw conflict('Le HT remboursé dépasse la base nette de l’encaissement')
        allocation = regularised === 0 ? allocatePayment(0, rules) : refundRegularisation(base, regularised, rules)
        allocation.companyCents -= excess
      }
    } else {
      await ProjectFinance.updateOne({ project: invoice.project }, { $currentDate: { updatedAt: true } }, { session })
      const finance = await ProjectFinance.findOne({ project: invoice.project }).session(session)
      if (finance?.shareActivationDate && finance.shareActivationDate <= receivedAt) {
        const versions = await ShareRuleVersion.find({
          project: invoice.project,
          effectiveFrom: { $lte: receivedAt },
        }).session(session)
        if (versions.length) {
          const selected = ruleVersionAt(
            versions.map((version) => ({
              version: version.version,
              effectiveFrom: version.effectiveFrom,
              rules: version.rules.map((rule) => ({ key: String(rule.beneficiary), bp: rule.bp })),
            })),
            receivedAt,
          )
          selectedVersion = versions.find((version) => version.version === selected.version)!
        }
      }
      allocation = allocatePayment(
        htCents,
        (selectedVersion?.rules ?? []).map((rule) => ({ key: String(rule.beneficiary), bp: rule.bp })),
      )
    }
    const payment = new ProjectPayment({
      project: invoice.project,
      invoice: invoice._id,
      payerId: invoice.payer?.payerId ?? null,
      kind: input.kind,
      amountTtcCents,
      htCents,
      method: input.kind === 'PAYMENT' ? input.method : original!.method,
      receivedAt,
      reference: input.kind === 'PAYMENT' ? (input.reference ?? '') : original!.reference,
      reason: input.kind === 'REFUND' ? input.reason.trim() : '',
      refundOf: original?._id ?? null,
      ruleVersion: selectedVersion?._id ?? null,
      source: original?.source ?? (input.kind === 'PAYMENT' && input.stripe ? 'STRIPE' : 'MANUAL'),
      ...(input.kind === 'PAYMENT' &&
        input.stripe && {
          stripePaymentIntentId: input.stripe.paymentIntentId,
          stripeChargeId: input.stripe.chargeId,
        }),
      idempotencyKey: input.idempotencyKey,
      requestHash,
      createdBy: input.userId,
    })
    let auxiliaryRef: CreateEntryLineInput['auxiliaryRef']
    if (invoice.payer?.kind === 'CLIENT') auxiliaryRef = { kind: 'CLIENT', id: invoice.payer.user }
    else if (invoice.payer) auxiliaryRef = { kind: 'OTHER', id: invoice.payer.subsidiary }
    const lettrage = invoice.number
      .replace(/[^A-Z0-9]/gi, '')
      .slice(-8)
      .toUpperCase()
    const stripePayment = input.kind === 'PAYMENT' ? input.stripe : undefined
    const useStripe = Boolean(stripePayment || original?.source === 'STRIPE')
    let bankCode = '512800'
    if (!useStripe) {
      const bankAccount = await resolveBankAccount({ session })
      if (!bankAccount) throw moneyError('Compte bancaire introuvable : initialisez le plan comptable')
      bankCode = bankAccount.code
    }
    const feeCents = stripePayment?.feeCents ?? 0
    assertCents(feeCents, 'Commission Stripe')
    if (feeCents < 0 || feeCents > input.amountTtcCents) throw moneyError('Commission Stripe incohérente')
    if (stripePayment && input.kind === 'PAYMENT' && input.method !== 'STRIPE') throw moneyError('Moyen Stripe requis')
    const bankCents = amountTtcCents - feeCents
    const lines: CreateEntryLineInput[] = []
    if (bankCents !== 0)
      lines.push({ account: bankCode, debit: Math.max(bankCents, 0) / 100, credit: Math.max(-bankCents, 0) / 100 })
    if (feeCents > 0) lines.push({ account: '627800', debit: feeCents / 100 })
    lines.push({
      account: '411000',
      debit: Math.max(-amountTtcCents, 0) / 100,
      credit: Math.max(amountTtcCents, 0) / 100,
      auxiliaryRef,
      lettrage,
    })
    const entry = await createEntry({
      journal: 'BQ',
      date: receivedAt,
      label: `Règlement facture ${invoice.number}`,
      pieceRef: invoice.number,
      lines,
      source: 'PAYMENT',
      sourceRef: { kind: 'PROJECT_PAYMENT', id: payment._id as Types.ObjectId },
      idempotencyKey: `payment:${payment._id}`,
      status: 'VALIDATED',
      createdBy: input.userId,
      currency: invoice.currency,
      session,
    })
    payment.entry = entry.entry._id as Types.ObjectId
    await payment.save({ session })
    const rules = selectedVersion?.rules ?? []
    for (const part of allocation.beneficiaries) {
      await new ShareAllocation({
        project: invoice.project,
        payment: payment._id,
        beneficiary: part.key,
        amountCents: part.cents,
        bp: rules.find((rule) => String(rule.beneficiary) === part.key)!.bp,
        ruleVersion: payment.ruleVersion,
      }).save({ session })
    }
    await new ShareAllocation({
      project: invoice.project,
      payment: payment._id,
      beneficiary: null,
      amountCents: allocation.companyCents,
      bp: null,
      ruleVersion: payment.ruleVersion,
    }).save({ session })
    const wasPaid = invoice.status === 'PAID'
    invoice.paidAt = null
    if (after === balance.ttcCents) {
      invoice.status = 'PAID'
      invoice.paidAt = receivedAt
    } else if (after > 0) invoice.status = 'PARTIALLY_PAID'
    else invoice.status = invoice.sentAt ? 'SENT' : 'ISSUED'
    await invoice.save({ session })
    return { payment, alreadyExisted: false, paidInvoice: !wasPaid && invoice.status === 'PAID' ? invoice : null }
  }
  // Une collision d'index (même clé envoyée deux fois en même temps, première numérotation
  // d'un journal) se résout en relisant : le second passage trouve ce que le premier a validé.
  const result = await (transactionSession ? operation(transactionSession) : runInTransaction(operation)).catch(
    (error: unknown) => {
      if (transactionSession) throw error
      if ((error as { code?: number }).code !== 11000) throw error
      return runInTransaction(operation)
    },
  )
  if (result.paidInvoice && !transactionSession) {
    const invoice = result.paidInvoice
    await notifySuperAdmins({
      type: 'BILLING_DOCUMENT_PAID',
      title: 'Facture payée 💰',
      message: `${invoice.number} — ${invoice.total.toLocaleString('fr-FR')} ${invoice.currency} encaissés`,
      link: `/admin/billing/${invoice._id}`,
      metadata: { documentId: String(invoice._id) },
      excludeUserId: input.userId,
    }).catch(() => {})
  }
  return { payment: result.payment, alreadyExisted: result.alreadyExisted }
}

export async function recordPayment(
  input: PaymentInput,
  options: { session?: ClientSession; expiredCheckoutSessionId?: string | null } = {},
) {
  let expiredCheckoutSessionId = options.expiredCheckoutSessionId
  if (!options.session) expiredCheckoutSessionId = await expireInvoiceCheckout(input.invoiceId)
  return recordMovement({ ...input, kind: 'PAYMENT' }, options.session, expiredCheckoutSessionId)
}

export function recordRefund(input: RefundInput, session?: ClientSession) {
  return recordMovement({ ...input, kind: 'REFUND' }, session)
}

export async function markInvoicePaid({
  invoice,
  method,
  paidAt,
  userId,
}: {
  invoice: IBillingDocument
  method: IFinancePayer['paymentMethod'] | undefined
  paidAt: Date | string | undefined
  userId: string
}) {
  const balance = await invoicePaymentBalance(invoice, null)
  if (balance.remainingTtcCents <= 0) return null
  let paymentMethod = method
  if (!paymentMethod && invoice.payer) {
    const finance = await ProjectFinance.findOne({ project: invoice.project })
    paymentMethod = finance?.payers.find((payer) => String(payer._id) === String(invoice.payer!.payerId))?.paymentMethod
  }
  return recordPayment({
    invoiceId: String(invoice._id),
    amountTtcCents: balance.remainingTtcCents,
    method: paymentMethod ?? 'VIREMENT',
    receivedAt: paidAt ?? new Date(),
    userId,
    idempotencyKey: `mark-paid:${invoice._id}:${balance.payments.length}`,
  })
}

export async function projectFinanceSummary(
  projectId: string | Types.ObjectId,
  period: { from?: Date; to?: Date } = {},
) {
  const range =
    period.from || period.to
      ? {
          ...(period.from && { $gte: period.from }),
          ...(period.to && { $lte: period.to }),
        }
      : null
  return runInTransaction(async (session) => {
    const invoices = await BillingDocument.find({
      project: projectId,
      type: 'INVOICE',
      creditedInvoice: null,
      status: { $nin: ['DRAFT', 'CANCELLED'] },
      ...(range && { $or: [{ issuedAt: range }, { issuedAt: null, createdAt: range }] }),
    }).session(session)
    let invoicedHtCents = 0
    let invoicedTtcCents = 0
    let remainingTtcCents = 0
    const overdueInvoices: { invoice: Types.ObjectId; remainingTtcCents: number }[] = []
    for (const invoice of invoices) {
      const balance = await invoicePaymentBalance(invoice, session)
      invoicedHtCents += balance.htCents
      invoicedTtcCents += balance.ttcCents
      remainingTtcCents += balance.remainingTtcCents
      if (invoice.dueAt && invoice.dueAt < new Date() && balance.remainingTtcCents > 0) {
        overdueInvoices.push({ invoice: invoice._id as Types.ObjectId, remainingTtcCents: balance.remainingTtcCents })
      }
    }
    const payments = await ProjectPayment.find({ project: projectId, ...(range && { receivedAt: range }) }).session(
      session,
    )
    const receivedTtcCents = payments.reduce((sum, payment) => sum + payment.amountTtcCents, 0)
    const receivedHtCents = payments.reduce((sum, payment) => sum + payment.htCents, 0)
    const allocations = await ShareAllocation.find({
      project: projectId,
      ...(range && { payment: { $in: payments.map((row) => row._id) } }),
    }).session(session)
    const settlements = await ShareSettlement.find({ project: projectId, ...(range && { paidAt: range }) }).session(
      session,
    )
    const costLines = (await projectCostLines(projectId, session)).filter(
      (line) => (!period.from || line.entry.date >= period.from) && (!period.to || line.entry.date <= period.to),
    )
    const directCostsCents = costLines.reduce((sum, line) => sum + toCents(line.debit) - toCents(line.credit), 0)
    assertCents(directCostsCents)
    const marginCents = receivedHtCents - directCostsCents
    if (allocations.reduce((sum, row) => sum + row.amountCents, 0) !== receivedHtCents) {
      throw new Error('La somme des parts du projet diffère du HT encaissé')
    }
    const grouped = new Map<string, { beneficiary: Types.ObjectId | null; amounts: number[] }>()
    grouped.set('null', { beneficiary: null, amounts: [] })
    for (const row of allocations) {
      const key = String(row.beneficiary)
      if (!grouped.has(key)) grouped.set(key, { beneficiary: row.beneficiary, amounts: [] })
      grouped.get(key)!.amounts.push(row.amountCents)
    }
    for (const settlement of settlements) {
      const key = String(settlement.beneficiary)
      if (!grouped.has(key)) grouped.set(key, { beneficiary: settlement.beneficiary, amounts: [] })
    }
    const beneficiaries = [...grouped.values()].map((group) => ({
      beneficiary: group.beneficiary,
      ...beneficiaryStatement(
        group.amounts,
        [
          settlements
            .filter((row) => String(row.beneficiary) === String(group.beneficiary))
            .reduce((sum, row) => sum + row.htCents, 0),
        ].filter((amount) => amount !== 0),
      ),
    }))
    for (const amount of [
      invoicedHtCents,
      invoicedTtcCents,
      receivedTtcCents,
      receivedHtCents,
      remainingTtcCents,
      marginCents,
    ])
      assertCents(amount)
    return {
      invoicedHtCents,
      invoicedTtcCents,
      receivedTtcCents,
      receivedHtCents,
      remainingTtcCents,
      directCostsCents,
      marginCents,
      overdueInvoices,
      beneficiaries,
    }
  })
}
