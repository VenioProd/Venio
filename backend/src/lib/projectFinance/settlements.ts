import { createHash } from 'node:crypto'
import { type ClientSession, type Types } from 'mongoose'
import Beneficiary from '../../models/Beneficiary.js'
import Project from '../../models/Project.js'
import ProjectPayment from '../../models/ProjectPayment.js'
import ShareAllocation from '../../models/ShareAllocation.js'
import ShareSettlement from '../../models/ShareSettlement.js'
import ProjectCost from '../../models/ProjectCost.js'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import VatRate from '../../models/VatRate.js'
import FiscalYear from '../../models/FiscalYear.js'
import BillingDocument from '../../models/BillingDocument.js'
import { createEntry, ensureFiscalYearFor, type CreateEntryLineInput } from '../accounting/doubleEntry.js'
import { resolveBankAccount } from '../accounting/paymentToEntry.js'
import { runInTransaction } from '../transaction.js'
import { assertCents, moneyError } from './money.js'
import { beneficiaryStatement } from './rules.js'

function failure(message: string, status = 400) {
  const error = moneyError(message)
  error.status = status
  return error
}

function dateFor(value: Date | string) {
  if (!(value instanceof Date) && (typeof value !== 'string' || !value.trim())) throw failure('La date est requise')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw failure('Date invalide')
  return date
}

function requestHashFor(idempotencyKey: string, request: object) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw failure('La clé d’idempotence est requise')
  return createHash('sha256').update(JSON.stringify(request)).digest('hex')
}

function validateAmounts(htCents: number, vatCents: number) {
  assertCents(htCents, 'Montant HT')
  assertCents(vatCents, 'TVA')
  assertCents(htCents + vatCents, 'Montant TTC')
  if (htCents <= 0 || vatCents < 0) throw failure('Le HT doit être positif et la TVA positive ou nulle')
}

async function deductibleVatLine(vatCents: number, session: ClientSession): Promise<CreateEntryLineInput[]> {
  if (vatCents === 0) return []
  const rate = await VatRate.findOne({ rate: 20, isActive: true }).session(session)
  return [{ account: rate?.deductibleAccount || '445660', debit: vatCents / 100 }]
}

async function checkPayrollYear(date: Date, session: ClientSession) {
  const year = await ensureFiscalYearFor(date, session)
  const updated = await FiscalYear.updateOne(
    { _id: year._id, status: 'OUVERT' },
    { $currentDate: { updatedAt: true } },
    { session },
  )
  if (updated.matchedCount === 0) throw failure('L’exercice contenant cette date est clôturé', 423)
}

interface SettlementInput {
  beneficiaryId: string
  projectId?: string | null
  htCents: number
  vatCents: number
  paidAt: Date | string
  invoiceRef: string
  note?: string
  idempotencyKey: string
  userId: string
}
interface ReversalInput {
  settlementId: string
  reason: string
  idempotencyKey: string
  userId: string
}
type Movement = ({ kind: 'SETTLEMENT' } & SettlementInput) | ({ kind: 'REVERSAL' } & ReversalInput)

async function recordMovement(input: Movement) {
  const paidAt = input.kind === 'SETTLEMENT' ? dateFor(input.paidAt) : new Date()
  const requestHash = requestHashFor(input.idempotencyKey, {
    kind: input.kind,
    userId: input.userId,
    ...(input.kind === 'SETTLEMENT'
      ? {
          beneficiaryId: input.beneficiaryId,
          projectId: input.projectId ?? null,
          htCents: input.htCents,
          vatCents: input.vatCents,
          paidAt: paidAt.toISOString(),
          invoiceRef: input.invoiceRef,
          note: input.note ?? '',
        }
      : { settlementId: input.settlementId, reason: input.reason }),
  })
  const operation = async (session: ClientSession) => {
    const existing = await ShareSettlement.findOne({ idempotencyKey: input.idempotencyKey }).session(session)
    if (existing) {
      if (existing.requestHash !== requestHash) throw failure('Cette clé d’idempotence désigne une autre demande', 409)
      return { settlement: existing, alreadyExisted: true }
    }
    const original =
      input.kind === 'REVERSAL' ? await ShareSettlement.findById(input.settlementId).session(session) : null
    if (input.kind === 'REVERSAL' && (!original || original.kind !== 'SETTLEMENT'))
      throw failure('Le versement à annuler est introuvable', 409)
    const beneficiaryId = input.kind === 'SETTLEMENT' ? input.beneficiaryId : original!.beneficiary
    // Cette écriture oblige les versements concurrents à relire le restant après commit.
    await Beneficiary.updateOne({ _id: beneficiaryId }, { $currentDate: { updatedAt: true } }, { session })
    const beneficiary = await Beneficiary.findById(beneficiaryId).session(session)
    if (!beneficiary) throw failure('Bénéficiaire introuvable', 404)
    if (original && (await ShareSettlement.exists({ reversalOf: original._id }).session(session)))
      throw failure('Ce versement a déjà été annulé', 409)
    let project = original?.project ?? null
    if (input.kind === 'SETTLEMENT') {
      validateAmounts(input.htCents, input.vatCents)
      if (paidAt.getTime() > Date.now()) throw failure('La date du versement ne peut pas être dans le futur')
      if (typeof input.invoiceRef !== 'string' || !input.invoiceRef.trim())
        throw failure('La référence de facture est requise')
      if (input.note !== undefined && typeof input.note !== 'string') throw failure('La note doit être un texte')
      if (!beneficiary.vatRegistered && input.vatCents !== 0)
        throw failure('Ce bénéficiaire n’est pas assujetti à la TVA')
      if (input.projectId != null) {
        const selectedProject = await Project.findById(input.projectId).session(session)
        if (!selectedProject) throw failure('Projet introuvable', 404)
        project = selectedProject._id as Types.ObjectId
      }
      const allocations = await ShareAllocation.find({ beneficiary: beneficiaryId }).session(session)
      const settlements = await ShareSettlement.find({ beneficiary: beneficiaryId }).session(session)
      const global = beneficiaryStatement(
        allocations.map((row) => row.amountCents),
        [settlements.reduce((sum, row) => sum + row.htCents, 0)].filter((amount) => amount !== 0),
      )
      if (input.htCents > global.remainingCents)
        throw failure('Le versement dépasse le restant global du bénéficiaire', 409)
      if (project) {
        const attached = beneficiaryStatement(
          allocations.filter((row) => String(row.project) === String(project)).map((row) => row.amountCents),
          [
            settlements
              .filter((row) => String(row.project) === String(project))
              .reduce((sum, row) => sum + row.htCents, 0),
          ].filter((amount) => amount !== 0),
        )
        if (input.htCents > attached.remainingCents) throw failure('Le versement dépasse le restant sur le projet', 409)
      }
    } else if (typeof input.reason !== 'string' || !input.reason.trim()) {
      throw failure('Le motif de l’annulation est requis')
    }
    const settlement = new ShareSettlement({
      beneficiary: beneficiaryId,
      project,
      kind: input.kind,
      htCents: input.kind === 'SETTLEMENT' ? input.htCents : -original!.htCents,
      vatCents: input.kind === 'SETTLEMENT' ? input.vatCents : -original!.vatCents,
      paidAt,
      invoiceRef: input.kind === 'SETTLEMENT' ? input.invoiceRef : original!.invoiceRef,
      note: input.kind === 'SETTLEMENT' ? (input.note ?? '') : input.reason.trim(),
      mode: original?.mode ?? beneficiary.settlementMode,
      reversalOf: original?._id ?? null,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      createdBy: input.userId,
    })
    if (settlement.mode === 'BANQUE') {
      let lines: CreateEntryLineInput[]
      if (original) {
        const originalLines = await AccountingLine.find({ entry: original.entry })
          .sort({ sortIndex: 1 })
          .session(session)
        lines = []
        for (const line of originalLines) {
          const account = await ChartOfAccount.findById(line.account).session(session)
          if (!account) throw failure('Compte du versement d’origine introuvable', 409)
          // Un renommage du compte ne doit pas changer l’instantané contre-passé.
          account.code = line.accountCode
          account.label = line.accountLabel
          lines.push({
            account,
            debit: line.credit,
            credit: line.debit,
            auxiliaryRef: line.auxiliaryRef,
            vatRate: line.vatRate,
            vatRateValue: line.vatRateValue,
          })
        }
      } else {
        const account = await ChartOfAccount.findOne({ code: beneficiary.defaultAccountCode, isActive: true }).session(
          session,
        )
        if (!account) throw failure('Le compte du bénéficiaire doit être actif')
        const bank = await resolveBankAccount({ session })
        if (!bank) throw failure('Compte bancaire introuvable')
        lines = [
          {
            account: account.code,
            debit: settlement.htCents / 100,
            auxiliaryRef: { kind: 'SUPPLIER', id: beneficiary._id as Types.ObjectId },
          },
          ...(await deductibleVatLine(settlement.vatCents, session)),
          { account: bank.code, credit: (settlement.htCents + settlement.vatCents) / 100 },
        ]
      }
      const result = await createEntry({
        journal: 'BQ',
        date: paidAt,
        label: `Versement ${beneficiary.displayName}`,
        pieceRef: settlement.invoiceRef,
        lines,
        source: 'PAYMENT',
        sourceRef: { kind: 'SHARE_SETTLEMENT', id: settlement._id as Types.ObjectId },
        idempotencyKey: `settlement:${settlement._id}`,
        status: 'VALIDATED',
        createdBy: input.userId,
        session,
      })
      settlement.entry = result.entry._id as Types.ObjectId
    } else {
      await checkPayrollYear(paidAt, session)
    }
    await settlement.save({ session })
    return { settlement, alreadyExisted: false }
  }
  return runInTransaction(operation).catch((error: unknown) => {
    if ((error as { code?: number }).code !== 11000) throw error
    return runInTransaction(operation)
  })
}

export function recordSettlement(input: SettlementInput) {
  return recordMovement({ ...input, kind: 'SETTLEMENT' })
}

export function reverseSettlement(input: ReversalInput) {
  return recordMovement({ ...input, kind: 'REVERSAL' })
}

interface CostInput {
  projectId: string
  accountCode: string
  label: string
  supplier: string
  htCents: number
  vatCents: number
  date: Date | string
  idempotencyKey: string
  userId: string
}

export async function recordProjectCost(input: CostInput) {
  const date = dateFor(input.date)
  const requestHash = requestHashFor(input.idempotencyKey, {
    projectId: input.projectId,
    accountCode: input.accountCode,
    label: input.label,
    supplier: input.supplier,
    htCents: input.htCents,
    vatCents: input.vatCents,
    date: date.toISOString(),
    userId: input.userId,
  })
  const operation = async (session: ClientSession) => {
    const existing = await ProjectCost.findOne({ idempotencyKey: input.idempotencyKey }).session(session)
    if (existing) {
      if (existing.requestHash !== requestHash) throw failure('Cette clé d’idempotence désigne une autre demande', 409)
      return { cost: existing, alreadyExisted: true }
    }
    await Project.updateOne({ _id: input.projectId }, { $currentDate: { updatedAt: true } }, { session })
    if (!(await Project.exists({ _id: input.projectId }).session(session))) throw failure('Projet introuvable', 404)
    validateAmounts(input.htCents, input.vatCents)
    if (typeof input.accountCode !== 'string' || !input.accountCode.startsWith('6'))
      throw failure('Un compte de classe 6 est requis')
    const account = await ChartOfAccount.findOne({ code: input.accountCode, accountClass: 6, isActive: true }).session(
      session,
    )
    if (!account) throw failure('Un compte de classe 6 actif est requis')
    for (const value of [input.label, input.supplier]) {
      if (typeof value !== 'string' || !value.trim()) throw failure('Le libellé et le fournisseur sont requis')
    }
    const cost = new ProjectCost({
      project: input.projectId,
      accountCode: input.accountCode,
      label: input.label,
      supplier: input.supplier,
      htCents: input.htCents,
      vatCents: input.vatCents,
      date,
      requestHash,
      idempotencyKey: input.idempotencyKey,
      createdBy: input.userId,
    })
    const result = await createEntry({
      journal: 'AC',
      date,
      label: input.label,
      lines: [
        { account: account.code, debit: input.htCents / 100, project: input.projectId },
        ...(await deductibleVatLine(input.vatCents, session)),
        { account: '401000', credit: (input.htCents + input.vatCents) / 100 },
      ],
      source: 'MANUAL',
      sourceRef: { kind: 'PROJECT_COST', id: cost._id as Types.ObjectId },
      idempotencyKey: `cost:${cost._id}`,
      status: 'VALIDATED',
      createdBy: input.userId,
      session,
    })
    cost.entry = result.entry._id as Types.ObjectId
    await cost.save({ session })
    return { cost, alreadyExisted: false }
  }
  return runInTransaction(operation).catch((error: unknown) => {
    if ((error as { code?: number }).code !== 11000) throw error
    return runInTransaction(operation)
  })
}

export async function projectCostLines(projectId: string | Types.ObjectId, session: ClientSession | null = null) {
  const lines = await AccountingLine.find({ project: projectId, accountCode: /^6/ }).session(session).lean()
  const entries = await AccountingEntry.find({
    _id: { $in: lines.map((line) => line.entry) },
    archivedAt: null,
    status: { $ne: 'DRAFT' },
  })
    .session(session)
    .lean()
  const entriesById = new Map(entries.map((entry) => [String(entry._id), entry]))
  return lines.flatMap((line) => {
    const entry = entriesById.get(String(line.entry))
    return entry ? [{ ...line, entry }] : []
  })
}

export async function beneficiaryStatementFor(beneficiaryId: string | Types.ObjectId) {
  return runInTransaction(async (session) => {
    const beneficiary = await Beneficiary.findById(beneficiaryId).session(session)
    if (!beneficiary) throw failure('Bénéficiaire introuvable', 404)
    const allocations = await ShareAllocation.find({ beneficiary: beneficiaryId }).session(session).lean()
    const settlements = await ShareSettlement.find({ beneficiary: beneficiaryId })
      .sort({ paidAt: 1, createdAt: 1 })
      .session(session)
      .lean()
    const payments = await ProjectPayment.find({ _id: { $in: allocations.map((row) => row.payment) } })
      .sort({ receivedAt: 1, createdAt: 1 })
      .session(session)
      .lean()
    const invoices = await BillingDocument.find({ _id: { $in: payments.map((payment) => payment.invoice) } })
      .select('number')
      .session(session)
      .lean()
    const projectIds = [...allocations, ...settlements].flatMap((row) => (row.project ? [row.project] : []))
    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('name')
      .session(session)
      .lean()
    const projectFor = (id: Types.ObjectId | null) => {
      if (!id) return null
      return { _id: id, name: projects.find((project) => String(project._id) === String(id))?.name ?? '' }
    }
    const totals = beneficiaryStatement(
      allocations.map((row) => row.amountCents),
      [settlements.reduce((sum, row) => sum + row.htCents, 0)].filter((amount) => amount !== 0),
    )
    const unattachedPaidCents = beneficiaryStatement(
      [],
      [settlements.filter((row) => !row.project).reduce((sum, row) => sum + row.htCents, 0)].filter(
        (amount) => amount !== 0,
      ),
    ).paidCents
    return {
      beneficiary: { _id: beneficiary._id, displayName: beneficiary.displayName },
      ...totals,
      unattachedPaidCents,
      projects: [...new Set(projectIds.map(String))].map((id) => ({
        project: projectFor(projectIds.find((projectId) => String(projectId) === id)!),
        ...beneficiaryStatement(
          allocations.filter((row) => String(row.project) === id).map((row) => row.amountCents),
          [settlements.filter((row) => String(row.project) === id).reduce((sum, row) => sum + row.htCents, 0)].filter(
            (amount) => amount !== 0,
          ),
        ),
      })),
      allocations: payments.flatMap((payment) =>
        allocations
          .filter((row) => String(row.payment) === String(payment._id))
          .map((row) => ({
            _id: row._id,
            project: projectFor(row.project),
            receivedAt: payment.receivedAt,
            invoiceNumber: invoices.find((invoice) => String(invoice._id) === String(payment.invoice))?.number ?? '',
            paymentHtCents: payment.htCents,
            bp: row.bp,
            amountCents: row.amountCents,
          })),
      ),
      settlements: settlements.map((row) => ({
        _id: row._id,
        project: projectFor(row.project),
        kind: row.kind,
        htCents: row.htCents,
        vatCents: row.vatCents,
        paidAt: row.paidAt,
        invoiceRef: row.invoiceRef,
        note: row.note,
        mode: row.mode,
        reversalOf: row.reversalOf,
      })),
    }
  })
}
