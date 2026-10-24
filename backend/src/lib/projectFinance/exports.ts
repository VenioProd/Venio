import PDFDocument from 'pdfkit'
import { Types } from 'mongoose'
import { buildCsv, type CsvCell } from '../accounting/csvExport.js'
import { runInTransaction } from '../transaction.js'
import { assertCents, moneyError, toCents } from './money.js'
import { beneficiaryStatement } from './rules.js'
import { beneficiaryStatementFor } from './settlements.js'
import { projectFinanceSummary } from './payments.js'
import { installmentSchedule } from './invoicing.js'
import ProjectPayment from '../../models/ProjectPayment.js'
import ShareAllocation from '../../models/ShareAllocation.js'
import ShareSettlement from '../../models/ShareSettlement.js'
import ShareRuleVersion from '../../models/ShareRuleVersion.js'
import ProjectCost from '../../models/ProjectCost.js'
import BillingDocument from '../../models/BillingDocument.js'
import Beneficiary from '../../models/Beneficiary.js'
import Project from '../../models/Project.js'
import ProjectFinance from '../../models/ProjectFinance.js'
import CompanySettings from '../../models/CompanySettings.js'
import User from '../../models/User.js'
import Subsidiary from '../../models/Subsidiary.js'

export interface ExportFilters {
  from?: Date
  to?: Date
  projectId?: string
}

export function exportFilters(query: Record<string, unknown>): ExportFilters {
  const result: ExportFilters = {}
  for (const key of ['from', 'to'] as const) {
    const value = query[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw moneyError('Les dates doivent être au format AAAA-MM-JJ')
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw moneyError('Date invalide')
    if (key === 'to') date.setUTCHours(23, 59, 59, 999)
    result[key] = date
  }
  if (result.from && result.to && result.from > result.to) throw moneyError('La date de début dépasse la date de fin')
  if (query.projectId !== undefined) {
    if (typeof query.projectId !== 'string' || !Types.ObjectId.isValid(query.projectId))
      throw moneyError('Identifiant de projet invalide')
    result.projectId = query.projectId
  }
  return result
}

export function formatCents(cents: number): string {
  assertCents(cents)
  const value = BigInt(cents)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 100n},${String(absolute % 100n).padStart(2, '0')}`
}

// Montant pour le PDF : milliers séparés par une espace simple (les polices standard n'ont pas l'espace fine).
function pdfMoney(cents: number): string {
  const [units, decimals] = formatCents(cents).split(',')
  return `${units!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimals} €`
}

const STATUS_LABELS: Record<string, string> = {
  PLANIFIEE: 'Planifiée',
  A_FACTURER: 'À facturer',
  FACTUREE: 'Facturée',
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  SENT: 'Envoyée',
  ACCEPTED: 'Acceptée',
  PARTIALLY_PAID: 'Partiellement réglée',
  PAID: 'Réglée',
  CANCELLED: 'Annulée',
  BANQUE: 'Banque',
  PAIE: 'Paie',
}
const statusLabel = (status: string) => STATUS_LABELS[status] ?? status

function formatDate(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function dateMatch(filters: ExportFilters) {
  if (!filters.from && !filters.to) return undefined
  return { ...(filters.from && { $gte: filters.from }), ...(filters.to && { $lte: filters.to }) }
}

function inPeriod(date: Date, filters: ExportFilters): boolean {
  return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
}

export async function paymentsCsv(filters: ExportFilters): Promise<string> {
  return runInTransaction(async (session) => {
    const range = dateMatch(filters)
    const payments = await ProjectPayment.find({
      ...(filters.projectId && { project: filters.projectId }),
      ...(range && { receivedAt: range }),
    })
      .sort({ receivedAt: 1, _id: 1 })
      .session(session)
      .lean()
    const allocations = await ShareAllocation.find({ payment: { $in: payments.map((row) => row._id) } })
      .sort({ beneficiary: 1 })
      .session(session)
      .lean()
    const projects = await Project.find({ _id: { $in: payments.map((row) => row.project) } })
      .select('name')
      .session(session)
      .lean()
    const invoices = await BillingDocument.find({ _id: { $in: payments.map((row) => row.invoice) } })
      .session(session)
      .lean()
    const beneficiaries = await Beneficiary.find({
      _id: { $in: allocations.flatMap((row) => (row.beneficiary ? [row.beneficiary] : [])) },
    })
      .select('displayName')
      .session(session)
      .lean()
    const versions = await ShareRuleVersion.find({
      _id: { $in: allocations.flatMap((row) => (row.ruleVersion ? [row.ruleVersion] : [])) },
    })
      .select('version')
      .session(session)
      .lean()
    const users = await User.find({ _id: { $in: invoices.map((row) => row.payer?.user || row.client) } })
      .select('name')
      .session(session)
      .lean()
    const subsidiaries = await Subsidiary.find({
      _id: { $in: invoices.flatMap((row) => (row.payer?.subsidiary ? [row.payer.subsidiary] : [])) },
    })
      .select('name')
      .session(session)
      .lean()
    const rows: CsvCell[][] = []
    for (const payment of payments) {
      const parts = allocations.filter((row) => String(row.payment) === String(payment._id))
      if (
        parts.filter((row) => !row.beneficiary).length !== 1 ||
        parts.reduce((sum, row) => sum + row.amountCents, 0) !== payment.htCents
      ) {
        const error = moneyError(
          'Répartition incohérente : part société absente ou somme des parts différente du HT encaissé',
        )
        error.status = 409
        throw error
      }
      const invoice = invoices.find((row) => String(row._id) === String(payment.invoice))
      const payer =
        invoice?.payer?.billingContact?.name ||
        subsidiaries.find((row) => String(row._id) === String(invoice?.payer?.subsidiary))?.name ||
        users.find((row) => String(row._id) === String(invoice?.payer?.user || invoice?.client))?.name ||
        ''
      for (const part of parts) {
        const bp = part.bp ?? 10000 - parts.reduce((sum, row) => sum + (row.bp ?? 0), 0)
        rows.push([
          formatDate(payment.receivedAt),
          payment.kind === 'REFUND' ? 'Remboursement' : 'Encaissement',
          projects.find((row) => String(row._id) === String(payment.project))?.name ?? '',
          invoice?.number ?? '',
          payer,
          formatCents(payment.amountTtcCents),
          formatCents(payment.htCents),
          part.beneficiary
            ? (beneficiaries.find((row) => String(row._id) === String(part.beneficiary))?.displayName ?? '')
            : 'Société',
          formatCents(bp),
          formatCents(part.amountCents),
          versions.find((row) => String(row._id) === String(part.ruleVersion))?.version ?? '',
        ])
      }
    }
    return buildCsv(
      [
        'Date d’encaissement',
        'Type',
        'Projet',
        'Facture',
        'Payeur',
        'Encaissement TTC',
        'Encaissement HT',
        'Bénéficiaire',
        '% appliqué',
        'Montant de la part',
        'Version de règles',
      ],
      rows,
    )
  })
}

export async function settlementsCostsCsv(filters: ExportFilters): Promise<string> {
  return runInTransaction(async (session) => {
    const range = dateMatch(filters)
    const project = filters.projectId ? { project: filters.projectId } : {}
    const settlements = await ShareSettlement.find({ ...project, ...(range && { paidAt: range }) })
      .sort({ paidAt: 1, _id: 1 })
      .session(session)
      .lean()
    const costs = await ProjectCost.find({ ...project, ...(range && { date: range }) })
      .sort({ date: 1, _id: 1 })
      .session(session)
      .lean()
    const projects = await Project.find({
      _id: { $in: [...settlements, ...costs].flatMap((row) => (row.project ? [row.project] : [])) },
    })
      .select('name')
      .session(session)
      .lean()
    const beneficiaries = await Beneficiary.find({ _id: { $in: settlements.map((row) => row.beneficiary) } })
      .select('displayName')
      .session(session)
      .lean()
    const projectName = (id: Types.ObjectId | null) =>
      projects.find((row) => String(row._id) === String(id))?.name ?? ''
    return buildCsv(
      [
        'Nature',
        'Date',
        'Bénéficiaire',
        'Projet',
        'Compte',
        'Libellé',
        'Fournisseur',
        'HT',
        'TVA',
        'TTC',
        'Mode',
        'Référence de facture',
        'Note',
      ],
      [
        ...settlements.map((row) => [
          row.kind === 'REVERSAL' ? 'Annulation' : 'Versement',
          formatDate(row.paidAt),
          beneficiaries.find((item) => String(item._id) === String(row.beneficiary))?.displayName ?? '',
          projectName(row.project),
          '',
          '',
          '',
          formatCents(row.htCents),
          formatCents(row.vatCents),
          formatCents(row.htCents + row.vatCents),
          statusLabel(row.mode),
          row.invoiceRef,
          row.note,
        ]),
        ...costs.map((row) => [
          'Coût direct',
          formatDate(row.date),
          '',
          projectName(row.project),
          row.accountCode,
          row.label,
          row.supplier,
          formatCents(row.htCents),
          formatCents(row.vatCents),
          formatCents(row.htCents + row.vatCents),
          '',
          '',
          '',
        ]),
      ],
    )
  })
}

type Statement = Awaited<ReturnType<typeof beneficiaryStatementFor>>

export async function statementForExport(
  beneficiaryId: string | Types.ObjectId,
  filters: ExportFilters,
): Promise<Statement> {
  const statement = await beneficiaryStatementFor(beneficiaryId)
  const matchesProject = (project: { _id: Types.ObjectId } | null) =>
    !filters.projectId || String(project?._id) === filters.projectId
  const allocations = statement.allocations.filter(
    (row) => inPeriod(row.receivedAt, filters) && matchesProject(row.project),
  )
  const settlements = statement.settlements.filter(
    (row) => inPeriod(row.paidAt, filters) && matchesProject(row.project),
  )
  const totals = (parts: typeof allocations, paid: typeof settlements) =>
    beneficiaryStatement(
      parts.map((row) => row.amountCents),
      [paid.reduce((sum, row) => sum + row.htCents, 0)].filter((amount) => amount !== 0),
    )
  return {
    ...statement,
    ...totals(allocations, settlements),
    allocations,
    settlements,
    unattachedPaidCents: settlements.filter((row) => !row.project).reduce((sum, row) => sum + row.htCents, 0),
    projects: statement.projects
      .filter(
        (row) =>
          allocations.some((part) => String(part.project?._id) === String(row.project?._id)) ||
          settlements.some((paid) => String(paid.project?._id) === String(row.project?._id)),
      )
      .map((row) => ({
        project: row.project,
        ...totals(
          allocations.filter((part) => String(part.project?._id) === String(row.project?._id)),
          settlements.filter((paid) => String(paid.project?._id) === String(row.project?._id)),
        ),
      })),
  }
}

async function renderPdf(
  title: string,
  filters: ExportFilters,
  render: (pdf: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  const settings = await CompanySettings.findOne({ singletonKey: 'MAIN' }).lean()
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)
    pdf
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#111')
      .text(settings?.legalName || 'Venio')
    pdf.font('Helvetica').fontSize(9).fillColor('#444')
    for (const line of [
      settings?.legalForm,
      settings?.address?.line1,
      settings?.address?.line2,
      [settings?.address?.zip, settings?.address?.city].filter(Boolean).join(' '),
      settings?.address?.country,
      settings?.contactEmail,
      settings?.contactPhone,
    ]) {
      if (line) pdf.text(line)
    }
    if (settings?.siret) pdf.text(`SIRET ${settings.siret}`)
    if (settings?.vatNumber) pdf.text(`TVA intracom ${settings.vatNumber}`)
    pdf.moveDown().font('Helvetica-Bold').fontSize(22).fillColor('#0ea5e9').text(title)
    pdf.moveDown(0.5).font('Helvetica').fontSize(9).fillColor('#444')
    pdf.text(
      `Période : ${filters.from ? formatDate(filters.from) : 'début de l’historique'} au ${filters.to ? formatDate(filters.to) : 'dernier mouvement'}`,
    )
    pdf.moveDown().fillColor('#111')
    render(pdf)
    pdf.end()
  })
}

function section(pdf: PDFKit.PDFDocument, title: string) {
  if (pdf.y > pdf.page.height - 100) pdf.addPage()
  pdf.moveDown().font('Helvetica-Bold').fontSize(12).fillColor('#111').text(title)
  pdf.moveDown(0.3).font('Helvetica').fontSize(9)
}

function shareTotals(pdf: PDFKit.PDFDocument, totals: { dueCents: number; paidCents: number; remainingCents: number }) {
  pdf.text(
    `Dû HT : ${pdfMoney(totals.dueCents)} | Versé HT : ${pdfMoney(totals.paidCents)} | Restant HT : ${pdfMoney(totals.remainingCents)}`,
  )
}

export function renderStatementPdf(statement: Statement, filters: ExportFilters): Promise<Buffer> {
  return renderPdf('RELEVÉ BÉNÉFICIAIRE', filters, (pdf) => {
    section(pdf, statement.beneficiary.displayName)
    shareTotals(pdf, statement)
    section(pdf, 'Détail par projet')
    for (const row of statement.projects) {
      pdf.text(row.project?.name || 'Projet indisponible')
      shareTotals(pdf, row)
      pdf.moveDown(0.5)
    }
    pdf.text(`Versements sans rattachement : ${pdfMoney(statement.unattachedPaidCents)} HT`)
    section(pdf, 'Parts et régularisations')
    for (const row of statement.allocations) {
      pdf.text(`${formatDate(row.receivedAt)} | ${row.project?.name || ''} | ${row.invoiceNumber}`)
      pdf.text(
        `Base HT : ${pdfMoney(row.paymentHtCents)} | ${formatCents(row.bp ?? 0)} % | Part HT : ${pdfMoney(row.amountCents)}`,
      )
      pdf.moveDown(0.5)
    }
    section(pdf, 'Versements et annulations')
    for (const row of statement.settlements) {
      pdf.text(
        `${formatDate(row.paidAt)} | ${row.kind === 'REVERSAL' ? 'Annulation' : 'Versement'} | ${row.project?.name || 'Sans rattachement'}`,
      )
      pdf.text(
        `${pdfMoney(row.htCents)} HT | TVA ${pdfMoney(row.vatCents)} | TTC ${pdfMoney(row.htCents + row.vatCents)} | ${statusLabel(row.mode)}`,
      )
      pdf.text(`${row.invoiceRef}${row.note ? ` | ${row.note}` : ''}`).moveDown(0.5)
    }
  })
}

export async function projectSheetPdf(projectId: string, filters: ExportFilters): Promise<Buffer> {
  if (filters.projectId && filters.projectId !== projectId)
    throw moneyError('Le filtre projet ne correspond pas au projet demandé')
  const project = await Project.findById(projectId).lean()
  if (!project) {
    const error = moneyError('Projet introuvable')
    error.status = 404
    throw error
  }
  const summary = await projectFinanceSummary(projectId, filters)
  const finance = await ProjectFinance.findOne({ project: projectId }).lean()
  const schedule = finance ? await installmentSchedule(finance) : []
  const invoices = await BillingDocument.find({ project: projectId, type: 'INVOICE' })
    .sort({ issuedAt: 1, createdAt: 1 })
    .lean()
  const beneficiaries = await Beneficiary.find({
    _id: { $in: summary.beneficiaries.flatMap((row) => (row.beneficiary ? [row.beneficiary] : [])) },
  })
    .select('displayName')
    .lean()
  return renderPdf('FICHE PROJET', filters, (pdf) => {
    section(pdf, project.name)
    for (const [label, amount] of [
      ['Facturé HT', summary.invoicedHtCents],
      ['Facturé TTC', summary.invoicedTtcCents],
      ['Encaissé TTC', summary.receivedTtcCents],
      ['Reste à encaisser TTC (à ce jour)', summary.remainingTtcCents],
      ['HT encaissé net', summary.receivedHtCents],
      ['Coûts directs HT', summary.directCostsCents],
      ['Marge HT', summary.marginCents],
    ] as const)
      pdf.text(`${label} : ${pdfMoney(amount)}`)
    if (finance?.subscription) {
      const subscription = finance.subscription
      const periods = { MONTHLY: 'Mensuel', QUARTERLY: 'Trimestriel', YEARLY: 'Annuel' }
      section(pdf, 'Abonnement')
      pdf.text(
        `${periods[subscription.period]} | ${pdfMoney(subscription.amountHtCents)} HT | Début ${formatDate(subscription.startDate)}`,
      )
      if (subscription.endDate) pdf.text(`Fin ${formatDate(subscription.endDate)}`)
    } else {
      section(pdf, 'Échéancier')
      for (const row of schedule)
        pdf.text(
          `${row.label} | ${formatCents(row.percentBp)} % | ${pdfMoney(row.htCents)} HT | ${row.trigger.dueDate ? formatDate(row.trigger.dueDate) : 'Jalon'} | ${statusLabel(row.status)}`,
        )
    }
    section(pdf, 'Factures de la période')
    for (const row of invoices.filter((invoice) => inPeriod(invoice.issuedAt || invoice.createdAt, filters))) {
      pdf.text(
        `${row.number} | ${statusLabel(row.status)} | ${formatDate(row.issuedAt || row.createdAt)} | ${pdfMoney(toCents(row.subtotal))} HT | ${pdfMoney(toCents(row.total))} TTC`,
      )
    }
    section(pdf, 'Parts par bénéficiaire')
    for (const row of summary.beneficiaries) {
      pdf.text(
        row.beneficiary
          ? beneficiaries.find((item) => String(item._id) === String(row.beneficiary))?.displayName ||
              'Bénéficiaire indisponible'
          : 'Société',
      )
      shareTotals(pdf, row)
      pdf.moveDown(0.5)
    }
  })
}
