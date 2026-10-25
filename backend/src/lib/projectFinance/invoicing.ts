import type { ClientSession, Types } from 'mongoose'
import type { IBillingDocument, IProjectFinance, IFinanceSubscription } from '../../types/models/index.js'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectFinance from '../../models/ProjectFinance.js'
import Project from '../../models/Project.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import { getNextSequence } from '../../models/Sequence.js'
import { runInTransaction } from '../transaction.js'
import { lockProject } from '../projectWriteLock.js'
import { assertCents, moneyError, toCents, vatCents } from './money.js'
import { splitPayers, splitSchedule, subscriptionPeriodStart, subscriptionPeriodEnd } from './rules.js'

export function invoiceAmountsCents(doc: Pick<IBillingDocument, 'subtotal' | 'taxTotal' | 'total'>) {
  const htCents = toCents(doc.subtotal)
  const ttcCents = toCents(doc.total)
  const taxCents = ttcCents - htCents
  // Seuls les documents historiques à montants fractionnaires (29,985 €…) ont droit à un centime d'écart.
  const fractional = [doc.subtotal, doc.taxTotal, doc.total].some((amount) => toCents(amount) / 100 !== amount)
  const allowedGap = fractional ? 1 : 0
  if (Math.abs(taxCents - toCents(doc.taxTotal)) > allowedGap) throw moneyError('Facture incohérente : HT + TVA ≠ TTC')
  return { htCents, vatCents: taxCents, ttcCents }
}

function conflict(message: string) {
  const err = moneyError(message)
  err.status = 409
  return err
}

type FinanceConfig = Pick<
  IProjectFinance,
  'project' | 'mode' | 'contractHtCents' | 'vatRateBp' | 'installments' | 'payers'
>

function scheduleAmounts(finance: FinanceConfig) {
  return splitSchedule(
    finance.contractHtCents!,
    finance.installments.map((item) => ({ key: String(item._id), bp: item.percentBp })),
  )
}

function payerAmounts(finance: FinanceConfig, htCents: number) {
  const principal = finance.payers.find((payer) => payer.isPrincipal)
  return splitPayers(
    htCents,
    finance.payers.map((payer) => ({ key: String(payer._id), bp: payer.shareBp })),
    String(principal?._id),
  ).map((part) => {
    const taxCents = vatCents(part.cents, finance.vatRateBp)
    const ttcCents = part.cents + taxCents
    assertCents(ttcCents, 'TTC du payeur')
    return { payerId: part.key, htCents: part.cents, vatCents: taxCents, ttcCents }
  })
}

const activeInstallmentFilter = (projectId: string | Types.ObjectId) => ({
  project: projectId,
  'financeLink.kind': 'INSTALLMENT',
  financeKey: { $type: 'string' },
})

export async function generateInstallmentInvoices({
  projectId,
  installmentId,
  userId,
}: {
  projectId: string
  installmentId: string
  userId: string
}) {
  try {
    return await runInTransaction(async (session) => {
      await lockProject(projectId, session)
      const project = await Project.findById(projectId).session(session)
      const finance = await ProjectFinance.findOne({ project: projectId }).session(session)
      if (!project || !finance) {
        const err = moneyError('Projet ou configuration financière introuvable')
        err.status = 404
        throw err
      }
      if (finance.mode !== 'FORFAIT' && finance.mode !== 'ECHEANCIER') {
        throw moneyError('La génération d’échéance exige un forfait ou un échéancier')
      }
      const installment = finance.installments.find((item) => String(item._id) === installmentId)
      if (!installment) {
        const err = moneyError('Échéance introuvable')
        err.status = 404
        throw err
      }
      const existing = await BillingDocument.find({
        ...activeInstallmentFilter(projectId),
        'financeLink.installmentId': installment._id,
      }).session(session)
      const byKey = new Map(existing.map((invoice) => [invoice.financeKey, invoice]))
      const keys = finance.payers.map((payer) => `installment:${installmentId}:payer:${payer._id}`)
      if (existing.length === keys.length && keys.every((key) => byKey.has(key))) {
        return { invoices: keys.map((key) => byKey.get(key)!), alreadyExisted: true }
      }

      const htCents = scheduleAmounts(finance).find((part) => part.key === installmentId)!.cents
      const amounts = payerAmounts(finance, htCents)
      for (const invoice of existing) {
        const expected = amounts.find((part) => part.payerId === String(invoice.payer?.payerId))
        if (!expected || invoiceAmountsCents(invoice).htCents !== expected.htCents) {
          throw conflict('La répartition a changé : annulez les brouillons restants avant de régénérer cette échéance')
        }
      }

      // Cette écriture fait rejouer la transaction si la configuration change pendant la génération.
      await ProjectFinance.updateOne({ _id: finance._id }, { $currentDate: { updatedAt: true } }, { session })
      const invoices: IBillingDocument[] = []
      for (const [index, payer] of finance.payers.entries()) {
        const key = keys[index]!
        const previous = byKey.get(key)
        if (previous) {
          invoices.push(previous)
          continue
        }
        const amount = amounts[index]!
        const { formatted: number } = await getNextSequence('invoiceNumber', { prefix: 'FAC-', padding: 4, session })
        let description = `${installment.label} — ${project.name}`
        if (finance.payers.length > 1) description += ` — quote-part ${(payer.shareBp / 100).toLocaleString('fr-FR')} %`
        const invoice = new BillingDocument({
          type: 'INVOICE',
          number,
          project: project._id,
          client: project.client,
          status: 'DRAFT',
          payer: {
            payerId: payer._id,
            kind: payer.kind,
            user: payer.user,
            subsidiary: payer.subsidiary,
            billingContact: payer.billingContact,
          },
          lines: [
            {
              description,
              quantity: 1,
              unitPrice: amount.htCents / 100,
              taxRate: finance.vatRateBp / 100,
              total: amount.htCents / 100,
            },
          ],
          subtotal: amount.htCents / 100,
          taxTotal: amount.vatCents / 100,
          total: amount.ttcCents / 100,
          financeLink: { kind: 'INSTALLMENT', installmentId: installment._id },
          financeKey: key,
          dueAt: null,
          createdBy: userId,
        })
        await invoice.save({ session })
        invoices.push(invoice)
      }
      return { invoices, alreadyExisted: false }
    })
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict('Des factures existent déjà pour cette échéance ; rechargez le projet')
    }
    throw err
  }
}

export async function installmentSchedule(finance: FinanceConfig) {
  if (finance.mode === 'ABONNEMENT') return []
  const invoices = await BillingDocument.find(activeInstallmentFilter(finance.project)).lean()
  const completedPhases = await ProjectPhase.find({ project: finance.project, status: 'TERMINEE' }).select('_id').lean()
  const completedIds = new Set(completedPhases.map((phase) => String(phase._id)))
  const today = new Date().toISOString().slice(0, 10)
  return scheduleAmounts(finance).map((part, index) => {
    const installment = finance.installments[index]!
    const active = invoices.filter((invoice) => String(invoice.financeLink?.installmentId) === part.key)
    const { trigger } = installment
    const reached =
      trigger.kind === 'DATE'
        ? !!trigger.dueDate && trigger.dueDate.toISOString().slice(0, 10) <= today
        : completedIds.has(String(trigger.phase))
    let status = 'PLANIFIEE'
    if (active.length) status = 'FACTUREE'
    else if (reached) status = 'A_FACTURER'
    return {
      ...installment,
      htCents: part.cents,
      payers: payerAmounts(finance, part.cents),
      status,
      invoices: active.map((invoice) => ({
        _id: invoice._id,
        number: invoice.number,
        status: invoice.status,
        payer: invoice.payer,
        total: invoice.total,
      })),
    }
  })
}

export function assertFinanceChangesAllowed(
  current: IProjectFinance,
  replacement: IProjectFinance,
  invoices: IBillingDocument[],
) {
  if (!invoices.length) return
  const subscriptionInvoices = invoices.filter((invoice) => invoice.financeLink?.kind === 'SUBSCRIPTION')
  if (subscriptionInvoices.length) {
    const currentSubscription = current.subscription!
    const next = replacement.subscription
    const lastStart = Math.max(...subscriptionInvoices.map((invoice) => invoice.financeLink!.periodStart!.getTime()))
    if (
      current.mode !== replacement.mode ||
      !next ||
      currentSubscription.period !== next.period ||
      currentSubscription.startDate.getTime() !== next.startDate.getTime() ||
      (next.endDate && next.endDate.getTime() < lastStart)
    ) {
      throw conflict('Le calendrier de l’abonnement est figé après génération')
    }
    return
  }
  const sameSchedule =
    current.installments.length === replacement.installments.length &&
    current.installments.every((item, index) => {
      const next = replacement.installments[index]!
      return String(item._id) === String(next._id) && item.percentBp === next.percentBp
    })
  if (
    current.mode !== replacement.mode ||
    current.contractHtCents !== replacement.contractHtCents ||
    current.vatRateBp !== replacement.vatRateBp ||
    !sameSchedule
  ) {
    throw conflict('Le contrat et la répartition des échéances sont figés après facturation')
  }
  const invoicedIds = new Set(invoices.map((invoice) => String(invoice.financeLink?.installmentId)))
  for (const [index, item] of current.installments.entries()) {
    if (!invoicedIds.has(String(item._id))) continue
    const next = replacement.installments[index]!
    if (
      item.label !== next.label ||
      item.trigger.kind !== next.trigger.kind ||
      String(item.trigger.phase) !== String(next.trigger.phase) ||
      item.trigger.dueDate?.getTime() !== next.trigger.dueDate?.getTime()
    ) {
      throw conflict('Le libellé et le déclencheur d’une échéance facturée sont figés')
    }
  }
}

function subscriptionIndex(subscription: IFinanceSubscription, date: Date) {
  const months =
    (date.getUTCFullYear() - subscription.startDate.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    subscription.startDate.getUTCMonth()
  return months / { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[subscription.period]
}

const subscriptionFilter = (projectId: string | Types.ObjectId) => ({
  project: projectId,
  'financeLink.kind': 'SUBSCRIPTION',
})

async function subscriptionContext(projectId: string, session: ClientSession) {
  await lockProject(projectId, session)
  const finance = await ProjectFinance.findOne({ project: projectId }).session(session)
  const project = await Project.findById(projectId).session(session)
  if (!finance || !project) {
    const err = moneyError('Projet ou configuration financière introuvable')
    err.status = 404
    throw err
  }
  if (finance.mode !== 'ABONNEMENT' || !finance.subscription) throw moneyError('Le projet exige un abonnement')
  // Le PUT et les générations doivent partager le même point de sérialisation.
  await ProjectFinance.updateOne({ _id: finance._id }, { $currentDate: { updatedAt: true } }, { session })
  return { finance, project, subscription: finance.subscription }
}

async function createSubscriptionPeriod(
  context: Awaited<ReturnType<typeof subscriptionContext>>,
  index: number,
  userId: string,
  session: ClientSession,
) {
  const { finance, project, subscription } = context
  const periodStart = subscriptionPeriodStart(subscription.startDate, subscription.period, index)
  const periodEnd = subscriptionPeriodEnd(subscription.startDate, subscription.period, index)
  const amounts = payerAmounts(finance, subscription.amountHtCents)
  const invoices: IBillingDocument[] = []
  const formatDate = (date: Date) => date.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
  for (const [payerIndex, payer] of finance.payers.entries()) {
    const amount = amounts[payerIndex]!
    const { formatted: number } = await getNextSequence('invoiceNumber', { prefix: 'FAC-', padding: 4, session })
    let description = `${project.name} — abonnement du ${formatDate(periodStart)} au ${formatDate(periodEnd)}`
    if (finance.payers.length > 1) description += ` — quote-part ${(payer.shareBp / 100).toLocaleString('fr-FR')} %`
    const invoice = new BillingDocument({
      type: 'INVOICE',
      number,
      project: project._id,
      client: project.client,
      status: 'DRAFT',
      payer: {
        payerId: payer._id,
        kind: payer.kind,
        user: payer.user,
        subsidiary: payer.subsidiary,
        billingContact: payer.billingContact,
      },
      lines: [
        {
          description,
          quantity: 1,
          unitPrice: amount.htCents / 100,
          taxRate: finance.vatRateBp / 100,
          total: amount.htCents / 100,
        },
      ],
      subtotal: amount.htCents / 100,
      taxTotal: amount.vatCents / 100,
      total: amount.ttcCents / 100,
      financeLink: { kind: 'SUBSCRIPTION', periodStart, periodEnd },
      financeKey: `subscription:${finance._id}:${periodStart.toISOString().slice(0, 10)}:payer:${payer._id}`,
      createdBy: userId,
    })
    await invoice.save({ session })
    invoices.push(invoice)
  }
  return invoices
}

async function subscriptionTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  try {
    return await runInTransaction(operation)
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err
    // Un premier numéro créé par un autre projet peut gagner l’upsert de la séquence.
    return runInTransaction(operation)
  }
}

export async function generateSubscriptionInvoices({
  projectId,
  now,
  userId,
}: {
  projectId: string
  now: Date
  userId: string
}) {
  if (!Number.isFinite(now.getTime())) throw moneyError('Date de génération invalide')
  const invoices: IBillingDocument[] = []
  let warning: string | null = null
  for (let count = 0; count < 12; count++) {
    try {
      const created = await subscriptionTransaction(async (session) => {
        const context = await subscriptionContext(projectId, session)
        const { subscription } = context
        const last = await BillingDocument.findOne(subscriptionFilter(projectId))
          .sort({ 'financeLink.periodStart': -1 })
          .session(session)
        let index = 0
        if (last) index = subscriptionIndex(subscription, last.financeLink!.periodStart!) + 1
        const start = subscriptionPeriodStart(subscription.startDate, subscription.period, index)
        if (start > now || (subscription.endDate && start > subscription.endDate)) return []
        return createSubscriptionPeriod(context, index, userId, session)
      })
      invoices.push(...created)
      if (!created.length) break
    } catch (err) {
      if (!invoices.length) throw err
      warning = `Génération interrompue après ${invoices.length} facture(s) : ${(err as Error).message}`
      break
    }
  }
  return { invoices, warning }
}

export async function generateSubscriptionPeriodInvoices({
  projectId,
  periodStart,
  userId,
}: {
  projectId: string
  periodStart: Date
  userId: string
}) {
  return subscriptionTransaction(async (session) => {
    const context = await subscriptionContext(projectId, session)
    const { subscription } = context
    const index = subscriptionIndex(subscription, periodStart)
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      !Number.isFinite(periodStart.getTime()) ||
      subscriptionPeriodStart(subscription.startDate, subscription.period, index).getTime() !== periodStart.getTime() ||
      periodStart > new Date() ||
      (subscription.endDate && periodStart > subscription.endDate)
    ) {
      throw moneyError('Date de début de période invalide ou future')
    }
    const active = await BillingDocument.exists({
      ...subscriptionFilter(projectId),
      'financeLink.periodStart': periodStart,
      status: { $ne: 'CANCELLED' },
    }).session(session)
    if (active) throw conflict('Cette période porte déjà des factures actives')
    return { invoices: await createSubscriptionPeriod(context, index, userId, session) }
  })
}

export async function subscriptionState(finance: Pick<IProjectFinance, 'project' | 'subscription'>) {
  const subscription = finance.subscription!
  const invoices = await BillingDocument.find(subscriptionFilter(finance.project))
    .sort({ 'financeLink.periodStart': 1, number: 1 })
    .lean()
  const periods = new Map<string, { periodStart: Date; periodEnd: Date; invoices: typeof invoices }>()
  for (const invoice of invoices) {
    const link = invoice.financeLink!
    const key = link.periodStart!.toISOString()
    if (!periods.has(key))
      periods.set(key, { periodStart: link.periodStart!, periodEnd: link.periodEnd!, invoices: [] })
    periods.get(key)!.invoices.push(invoice)
  }
  let index = 0
  if (invoices.length)
    index = subscriptionIndex(subscription, invoices[invoices.length - 1]!.financeLink!.periodStart!) + 1
  const next = subscriptionPeriodStart(subscription.startDate, subscription.period, index)
  return {
    periods: [...periods.values()].map((period) => ({
      ...period,
      invoices: period.invoices.map((invoice) => ({
        _id: invoice._id,
        number: invoice.number,
        status: invoice.status,
        payer: invoice.payer,
        total: invoice.total,
      })),
    })),
    nextPeriodStart: subscription.endDate && next > subscription.endDate ? null : next,
  }
}
