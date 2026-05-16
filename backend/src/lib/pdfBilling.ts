import PDFDocument from 'pdfkit'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import CompanySettings from '../models/CompanySettings.js'
import { buildFacturXMinimum } from './facturx.js'

const PAGE_MARGIN = 40
const COL_DESC_X = PAGE_MARGIN
const COL_QTY_X = 300
const COL_UNIT_X = 350
const COL_TVA_X = 420
const COL_TOTAL_X = 480
const TABLE_RIGHT = 555 // A4 width 595 minus margin

// Types minimaux utilisés ici : on reste tolérant à du `lean()` ou des
// IBillingDocument qui peuvent ne pas avoir tous les champs.
interface BillingLine {
  description?: string
  quantity?: number
  unitPrice?: number
  taxRate?: number
  total?: number
}

export interface PdfBillingDoc {
  type: string
  number: string
  lines?: BillingLine[]
  subtotal?: number
  taxTotal?: number
  total?: number
  currency?: string
  note?: string
  issuedAt?: Date | string | null
  createdAt?: Date | string | null
  dueAt?: Date | string | null
}

export interface PdfClient {
  name?: string
  email?: string
  phone?: string
  companyName?: string
  vatNumber?: string
  siret?: string
  address?: {
    line1?: string
    zip?: string
    city?: string
  }
}

export interface PdfProject {
  name?: string
  projectNumber?: string
}

interface VatGroup {
  rate: number
  ht: number
  tax: number
  ttc: number
}

function fmtAmount(n: number | null | undefined, currency = 'EUR'): string {
  const num = Number(n || 0)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(num)
}

function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('fr-FR')
}

function aggregateVat(lines: BillingLine[] | undefined): VatGroup[] {
  const map = new Map<number, { ht: number; tax: number }>()
  for (const line of lines || []) {
    const rate = Number(line.taxRate || 0)
    const ht = Number(line.total || 0)
    const tax = ht * (rate / 100)
    if (!map.has(rate)) map.set(rate, { ht: 0, tax: 0 })
    const acc = map.get(rate)!
    acc.ht += ht
    acc.tax += tax
  }
  const result: VatGroup[] = []
  for (const [rate, { ht, tax }] of map.entries()) {
    const htR = Math.round(ht * 100) / 100
    const taxR = Math.round(tax * 100) / 100
    result.push({ rate, ht: htR, tax: taxR, ttc: Math.round((htR + taxR) * 100) / 100 })
  }
  result.sort((a, b) => b.rate - a.rate)
  return result
}

function drawHorizontalLine(pdf: PDFKit.PDFDocument, y: number, color = '#cccccc'): void {
  pdf.save()
  pdf.strokeColor(color).lineWidth(0.5)
  pdf.moveTo(PAGE_MARGIN, y).lineTo(TABLE_RIGHT, y).stroke()
  pdf.restore()
}

// Minimal subset of CompanySettings used here (toléré null)
interface PdfSettings {
  legalName?: string
  legalForm?: string
  address?: {
    line1?: string
    line2?: string
    zip?: string
    city?: string
    country?: string
  }
  contactEmail?: string
  contactPhone?: string
  siret?: string
  vatNumber?: string
  rcs?: string
  apeNafCode?: string
  capitalSocial?: number | null
  legalMentions?: string
  invoiceFooterNote?: string
  latePaymentRateNote?: string
  paymentTermsDays?: number
  currency?: string
  ibanList?: Array<{
    label?: string
    iban?: string
    bic?: string
    bankName?: string
    bankAccount?: string
    isDefault?: boolean
  }>
}

function renderHeader(pdf: PDFKit.PDFDocument, doc: PdfBillingDoc, settings: PdfSettings | null): void {
  const isQuote = doc.type === 'QUOTE'
  const title = isQuote ? 'DEVIS' : 'FACTURE'

  // Bloc gauche : société émettrice
  pdf.fillColor('#111').font('Helvetica-Bold').fontSize(14)
  pdf.text(settings?.legalName || 'Venio', PAGE_MARGIN, PAGE_MARGIN, { width: 260 })
  pdf.font('Helvetica').fontSize(9).fillColor('#444')
  if (settings?.legalForm) pdf.text(settings.legalForm, { width: 260 })
  if (settings?.address?.line1) pdf.text(settings.address.line1, { width: 260 })
  const cityLine = [settings?.address?.zip, settings?.address?.city].filter(Boolean).join(' ')
  if (cityLine) pdf.text(cityLine, { width: 260 })
  if (settings?.address?.country && settings.address.country !== 'France') {
    pdf.text(settings.address.country, { width: 260 })
  }
  if (settings?.contactEmail) pdf.text(settings.contactEmail, { width: 260 })
  if (settings?.contactPhone) pdf.text(settings.contactPhone, { width: 260 })
  if (settings?.siret) pdf.text(`SIRET ${settings.siret}`, { width: 260 })
  if (settings?.vatNumber) pdf.text(`TVA intracom ${settings.vatNumber}`, { width: 260 })
  if (settings?.rcs) pdf.text(`RCS ${settings.rcs}`, { width: 260 })

  // Bloc droit : titre + numéro + dates
  pdf.fillColor('#0ea5e9').font('Helvetica-Bold').fontSize(26)
  pdf.text(title, 380, PAGE_MARGIN, { width: 175, align: 'right' })
  pdf.fillColor('#111').font('Helvetica').fontSize(10)
  pdf.text(`N° ${doc.number}`, 380, PAGE_MARGIN + 36, { width: 175, align: 'right' })
  pdf.text(`Émis le ${fmtDate(doc.issuedAt || doc.createdAt)}`, 380, PAGE_MARGIN + 52, {
    width: 175,
    align: 'right',
  })
  if (!isQuote && doc.dueAt) {
    pdf.text(`Échéance ${fmtDate(doc.dueAt)}`, 380, PAGE_MARGIN + 68, {
      width: 175,
      align: 'right',
    })
  }
}

function renderClientBlock(
  pdf: PDFKit.PDFDocument,
  client: PdfClient | null,
  project: PdfProject | null,
  yStart: number
): void {
  pdf.save()
  pdf.rect(PAGE_MARGIN, yStart, 240, 90).fillOpacity(0.04).fillColor('#0ea5e9').fill()
  pdf.restore()

  pdf.fillColor('#666').font('Helvetica').fontSize(8)
  pdf.text('FACTURÉ À', PAGE_MARGIN + 10, yStart + 10)

  pdf.fillColor('#111').font('Helvetica-Bold').fontSize(11)
  pdf.text(client?.companyName || client?.name || '—', PAGE_MARGIN + 10, yStart + 24, {
    width: 220,
  })
  pdf.font('Helvetica').fontSize(9).fillColor('#444')
  if (client?.email) pdf.text(client.email, PAGE_MARGIN + 10, pdf.y, { width: 220 })
  if (client?.phone) pdf.text(client.phone, { width: 220 })
  if (client?.address?.line1) pdf.text(client.address.line1, { width: 220 })
  if (client?.address?.zip || client?.address?.city) {
    pdf.text(
      [client.address.zip, client.address.city].filter(Boolean).join(' '),
      { width: 220 }
    )
  }
  if (client?.vatNumber) pdf.text(`TVA ${client.vatNumber}`, { width: 220 })
  if (client?.siret) pdf.text(`SIRET ${client.siret}`, { width: 220 })

  // Bloc projet à droite
  if (project) {
    pdf.fillColor('#666').font('Helvetica').fontSize(8)
    pdf.text('PROJET', 340, yStart + 10)
    pdf.fillColor('#111').font('Helvetica-Bold').fontSize(11)
    pdf.text(project.name || '—', 340, yStart + 24, { width: 215 })
    if (project.projectNumber) {
      pdf.font('Helvetica').fontSize(9).fillColor('#444')
      pdf.text(`Réf. ${project.projectNumber}`, 340, pdf.y, { width: 215 })
    }
  }
}

function renderLinesTable(
  pdf: PDFKit.PDFDocument,
  lines: BillingLine[] | undefined,
  currency: string,
  yStart: number
): number {
  // En-tête
  pdf.save()
  pdf.rect(PAGE_MARGIN, yStart, TABLE_RIGHT - PAGE_MARGIN, 24).fillColor('#0ea5e9').fillOpacity(0.12).fill()
  pdf.restore()

  pdf.fillColor('#111').font('Helvetica-Bold').fontSize(8.5)
  pdf.text('DÉSIGNATION', COL_DESC_X + 6, yStart + 8)
  pdf.text('QTÉ', COL_QTY_X, yStart + 8, { width: 40, align: 'right' })
  pdf.text('PRIX UNIT. HT', COL_UNIT_X, yStart + 8, { width: 60, align: 'right' })
  pdf.text('TVA', COL_TVA_X, yStart + 8, { width: 50, align: 'right' })
  pdf.text('TOTAL HT', COL_TOTAL_X, yStart + 8, { width: 70, align: 'right' })

  let y = yStart + 30
  pdf.font('Helvetica').fontSize(9).fillColor('#222')

  for (const line of lines || []) {
    const desc = line.description || '—'
    const qty = Number(line.quantity || 0)
    const unit = Number(line.unitPrice || 0)
    const rate = Number(line.taxRate || 0)
    const total = Number(line.total || qty * unit || 0)

    const descHeight = pdf.heightOfString(desc, { width: COL_QTY_X - COL_DESC_X - 12 })
    const rowHeight = Math.max(20, descHeight + 8)

    // Saut de page si dépassement
    if (y + rowHeight > 720) {
      pdf.addPage()
      y = PAGE_MARGIN
    }

    pdf.text(desc, COL_DESC_X + 6, y, { width: COL_QTY_X - COL_DESC_X - 12 })
    pdf.text(qty.toString(), COL_QTY_X, y, { width: 40, align: 'right' })
    pdf.text(fmtAmount(unit, currency), COL_UNIT_X, y, { width: 60, align: 'right' })
    pdf.text(rate ? `${rate}%` : '—', COL_TVA_X, y, { width: 50, align: 'right' })
    pdf.text(fmtAmount(total, currency), COL_TOTAL_X, y, { width: 70, align: 'right' })

    y += rowHeight
    drawHorizontalLine(pdf, y - 2, '#eeeeee')
  }

  return y
}

function renderTotalsAndVat(
  pdf: PDFKit.PDFDocument,
  doc: PdfBillingDoc,
  currency: string,
  yStart: number
): number {
  const grouped = aggregateVat(doc.lines)
  const totalHt = grouped.reduce((s, g) => s + g.ht, 0)
  const totalTax = grouped.reduce((s, g) => s + g.tax, 0)
  const totalTtc = totalHt + totalTax

  let y = yStart + 8

  // Récap TVA (multi-taux possible)
  if (grouped.length > 1) {
    pdf.fillColor('#666').font('Helvetica-Bold').fontSize(8)
    pdf.text('RÉCAP TVA', PAGE_MARGIN, y)
    y += 14
    pdf.font('Helvetica').fontSize(8.5).fillColor('#222')
    pdf.text('TAUX', PAGE_MARGIN, y)
    pdf.text('BASE HT', PAGE_MARGIN + 70, y, { width: 70, align: 'right' })
    pdf.text('MONTANT TVA', PAGE_MARGIN + 150, y, { width: 80, align: 'right' })
    y += 12
    for (const g of grouped) {
      pdf.text(`${g.rate}%`, PAGE_MARGIN, y)
      pdf.text(fmtAmount(g.ht, currency), PAGE_MARGIN + 70, y, { width: 70, align: 'right' })
      pdf.text(fmtAmount(g.tax, currency), PAGE_MARGIN + 150, y, { width: 80, align: 'right' })
      y += 12
    }
  }

  // Bloc totaux à droite
  const totalsBoxX = 380
  const totalsBoxWidth = TABLE_RIGHT - totalsBoxX
  const totalsBoxY = yStart + 8

  pdf.font('Helvetica').fontSize(10).fillColor('#111')
  pdf.text('Total HT', totalsBoxX, totalsBoxY, { width: totalsBoxWidth - 90, align: 'right' })
  pdf.text(fmtAmount(totalHt, currency), totalsBoxX, totalsBoxY, {
    width: totalsBoxWidth,
    align: 'right',
  })

  pdf.text('Total TVA', totalsBoxX, totalsBoxY + 16, {
    width: totalsBoxWidth - 90,
    align: 'right',
  })
  pdf.text(fmtAmount(totalTax, currency), totalsBoxX, totalsBoxY + 16, {
    width: totalsBoxWidth,
    align: 'right',
  })

  pdf.save()
  pdf.rect(totalsBoxX, totalsBoxY + 34, totalsBoxWidth, 26).fillColor('#0ea5e9').fillOpacity(0.18).fill()
  pdf.restore()

  pdf.font('Helvetica-Bold').fontSize(12).fillColor('#0c4a6e')
  pdf.text('Total TTC', totalsBoxX + 6, totalsBoxY + 41, {
    width: totalsBoxWidth - 96,
    align: 'right',
  })
  pdf.text(fmtAmount(totalTtc, currency), totalsBoxX, totalsBoxY + 41, {
    width: totalsBoxWidth - 6,
    align: 'right',
  })

  return Math.max(y, totalsBoxY + 70)
}

function renderPaymentBlock(
  pdf: PDFKit.PDFDocument,
  doc: PdfBillingDoc,
  settings: PdfSettings | null,
  yStart: number
): number {
  const isQuote = doc.type === 'QUOTE'
  let y = yStart + 20
  pdf.fillColor('#666').font('Helvetica-Bold').fontSize(8)
  pdf.text(isQuote ? 'CONDITIONS' : 'CONDITIONS DE PAIEMENT', PAGE_MARGIN, y)
  y += 12
  pdf.font('Helvetica').fontSize(8.5).fillColor('#222')

  if (!isQuote) {
    const term = settings?.paymentTermsDays ?? 30
    pdf.text(`Paiement à ${term} jours à compter de la date d'émission.`, PAGE_MARGIN, y, {
      width: TABLE_RIGHT - PAGE_MARGIN,
    })
    y = pdf.y + 4

    // IBAN si disponible
    const defaultIban = settings?.ibanList?.find((i) => i.isDefault) || settings?.ibanList?.[0]
    if (defaultIban?.iban) {
      pdf.font('Helvetica-Bold').fontSize(8.5)
      pdf.text('Coordonnées bancaires', PAGE_MARGIN, y)
      pdf.font('Helvetica').fontSize(8.5)
      if (defaultIban.bankName) pdf.text(`Banque : ${defaultIban.bankName}`, PAGE_MARGIN, pdf.y)
      pdf.text(`IBAN : ${defaultIban.iban}`, PAGE_MARGIN, pdf.y)
      if (defaultIban.bic) pdf.text(`BIC : ${defaultIban.bic}`, PAGE_MARGIN, pdf.y)
      y = pdf.y + 4
    }

    if (settings?.latePaymentRateNote) {
      pdf.font('Helvetica-Oblique').fontSize(7.5).fillColor('#666')
      pdf.text(settings.latePaymentRateNote, PAGE_MARGIN, y, {
        width: TABLE_RIGHT - PAGE_MARGIN,
        align: 'justify',
      })
      y = pdf.y + 4
    }
  } else if (doc.dueAt) {
    pdf.text(`Devis valable jusqu'au ${fmtDate(doc.dueAt)}.`, PAGE_MARGIN, y, {
      width: TABLE_RIGHT - PAGE_MARGIN,
    })
    y = pdf.y + 4
  }

  if (doc.note) {
    pdf.font('Helvetica-Bold').fontSize(8.5).fillColor('#222')
    pdf.text('Note', PAGE_MARGIN, y + 4)
    pdf.font('Helvetica').fontSize(8.5).fillColor('#444')
    pdf.text(doc.note, PAGE_MARGIN, pdf.y, { width: TABLE_RIGHT - PAGE_MARGIN })
    y = pdf.y + 4
  }

  return y
}

function renderFooter(pdf: PDFKit.PDFDocument, settings: PdfSettings | null): void {
  const y = 760
  drawHorizontalLine(pdf, y - 4, '#dddddd')
  pdf.font('Helvetica').fontSize(7).fillColor('#888')

  const parts: string[] = []
  if (settings?.legalName) parts.push(settings.legalName)
  if (settings?.legalForm) parts.push(settings.legalForm)
  if (settings?.capitalSocial) {
    parts.push(`Capital ${fmtAmount(settings.capitalSocial)}`)
  }
  if (settings?.siret) parts.push(`SIRET ${settings.siret}`)
  if (settings?.vatNumber) parts.push(`TVA ${settings.vatNumber}`)
  if (settings?.rcs) parts.push(`RCS ${settings.rcs}`)
  if (settings?.apeNafCode) parts.push(`APE ${settings.apeNafCode}`)

  pdf.text(parts.join(' — '), PAGE_MARGIN, y, {
    width: TABLE_RIGHT - PAGE_MARGIN,
    align: 'center',
  })

  if (settings?.legalMentions) {
    pdf.text(settings.legalMentions, PAGE_MARGIN, pdf.y + 2, {
      width: TABLE_RIGHT - PAGE_MARGIN,
      align: 'center',
    })
  }
}

/**
 * Génère le PDF d'un BillingDocument (devis ou facture).
 * Charge automatiquement les CompanySettings pour les mentions légales.
 *
 * Refonte conforme FR :
 *  - mentions légales (SIRET, TVA, RCS, APE, capital)
 *  - mention L441-10 (taux d'intérêt, indemnité 40€)
 *  - récap TVA multi-taux
 *  - IBAN / BIC depuis CompanySettings.ibanList (default)
 *  - embed Factur-X (profil MINIMUM) si FACTUR_X_ENABLED=true
 */
export async function generateBillingPdf(
  doc: PdfBillingDoc,
  client: PdfClient | null,
  project: PdfProject | null,
  storagePath: string,
  opts: { settings?: PdfSettings | null } = {}
): Promise<string> {
  const absolutePath = path.resolve(process.cwd(), storagePath)
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true })

  let settings: PdfSettings | null = opts.settings ?? null
  if (!settings) {
    settings = (await CompanySettings.findOne({ singletonKey: 'MAIN' })
      .lean()
      .catch(() => null)) as PdfSettings | null
  }

  return new Promise<string>((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN })
    const stream = fs.createWriteStream(absolutePath)
    pdf.pipe(stream)

    const currency = doc.currency || 'EUR'

    renderHeader(pdf, doc, settings)
    renderClientBlock(pdf, client, project, 160)
    const linesEndY = renderLinesTable(pdf, doc.lines, currency, 280)
    const totalsEndY = renderTotalsAndVat(pdf, doc, currency, linesEndY + 10)
    renderPaymentBlock(pdf, doc, settings, totalsEndY)
    renderFooter(pdf, settings)

    // Embed Factur-X (profil MINIMUM) si activé et facture (type INVOICE).
    // Les avoirs (type=INVOICE avec total < 0) restent éligibles.
    // L'embed se fait AVANT pdf.end() pour que PDFKit l'écrive dans le PDF.
    if (
      process.env.FACTUR_X_ENABLED === 'true' &&
      doc &&
      doc.type === 'INVOICE'
    ) {
      try {
        const xml = buildFacturXMinimum({ doc, client, project, settings })
        // PDFKit v0.13+ : pdf.file() attache un fichier intégré au PDF.
        // Pour une vraie conformité PDF/A-3 il faudrait poser l'AFRelationship
        // dans le catalogue — on documente la limitation côté lib.
        ;(pdf as unknown as {
          file: (buf: Buffer, opts: { name: string; type: string; description: string; relationship: string }) => void
        }).file(Buffer.from(xml, 'utf-8'), {
          name: 'factur-x.xml',
          type: 'text/xml',
          description: 'Factur-X invoice data',
          relationship: 'Alternative',
        })
      } catch (err) {
        // L'embed Factur-X ne doit pas casser la génération du PDF visuel.
        console.error('Factur-X embed failed:', (err as Error).message)
      }
    }

    pdf.end()
    stream.on('finish', () => resolve(absolutePath))
    stream.on('error', reject)
  })
}
