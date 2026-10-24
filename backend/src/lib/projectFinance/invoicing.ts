import type { Types } from 'mongoose'
import type { IBillingDocument, IProjectFinance } from '../../types/models/index.js'
import BillingDocument from '../../models/BillingDocument.js'
import ProjectFinance from '../../models/ProjectFinance.js'
import Project from '../../models/Project.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import { getNextSequence } from '../../models/Sequence.js'
import { runInTransaction } from '../transaction.js'
import { assertCents, moneyError, toCents, vatCents } from './money.js'
import { splitPayers, splitSchedule } from './rules.js'

export function invoiceAmountsCents(doc: Pick<IBillingDocument, 'subtotal' | 'taxTotal' | 'total'>) {
  const htCents = toCents(doc.subtotal)
  const taxCents = toCents(doc.taxTotal)
  const ttcCents = toCents(doc.total)
  if (htCents + taxCents !== ttcCents) throw moneyError('Facture incohérente : HT + TVA ≠ TTC')
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
