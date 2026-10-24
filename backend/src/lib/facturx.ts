/**
 * Génération du XML Factur-X profil MINIMUM (UN/CEFACT CrossIndustryInvoice).
 *
 * Conformité :
 *   - Spécification : https://fnfe-mpe.org/factur-x/ (profil MINIMUM)
 *   - Norme EN 16931 "light" — couvre l'essentiel pour la facturation B2B
 *     domestique. Pour le profil BASIC et au-delà il faudrait inclure les
 *     lignes et un détail TVA plus complet.
 *
 * En MINIMUM on doit fournir :
 *   - ExchangedDocument : ID, IssueDateTime, TypeCode (380 facture, 381 avoir)
 *   - SupplyChainTradeTransaction
 *     · ApplicableHeaderTradeAgreement   : SellerTradeParty + BuyerTradeParty
 *     · ApplicableHeaderTradeSettlement  : devise + monetary summation
 *
 * On ne dépend volontairement d'AUCUNE lib XML : on construit l'XML à la
 * main avec échappement strict pour éviter toute injection.
 */

import { assertBp, toCents, vatCents } from './projectFinance/money.js'
import type { Types } from 'mongoose'
import type { IBillingPayer } from '../types/models/billing.js'

const FACTURX_GUIDELINE_MINIMUM = 'urn:factur-x.eu:1p0:minimum'

// Échappe les caractères XML obligatoires.
function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Renvoie une date au format YYYYMMDD (format 102 — date sans heure).
function toFormat102(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// Formate un montant en string avec 2 décimales (point décimal).
function toAmount(n: number | null | undefined): string {
  const v = Number(n || 0)
  return v.toFixed(2)
}

interface FacturXLine {
  total?: number
  taxRate?: number
}

interface FacturXTotals {
  basisTotal: number
  taxTotal: number
  byRate: Array<{ rate: number; basis: number; tax: number }>
}

// Agrège les lignes de facture par taux de TVA.
function aggregateTotals(lines: FacturXLine[] | undefined): FacturXTotals {
  const byRate = new Map<number, number>()
  for (const line of lines || []) {
    const bp = Math.round((line.taxRate ?? 0) * 100)
    assertBp(bp, 'Taux de TVA')
    byRate.set(bp, (byRate.get(bp) ?? 0) + toCents(line.total ?? 0))
  }
  let basisTotalCents = 0
  let taxTotalCents = 0
  const grouped: FacturXTotals['byRate'] = []
  for (const [bp, htCents] of byRate) {
    const taxCents = vatCents(htCents, bp)
    basisTotalCents += htCents
    taxTotalCents += taxCents
    grouped.push({ rate: bp / 100, basis: htCents / 100, tax: taxCents / 100 })
  }
  return { basisTotal: basisTotalCents / 100, taxTotal: taxTotalCents / 100, byRate: grouped }
}

// Type minimaliste pour les entrées utilisateur (on n'impose pas IBillingDocument
// car certaines props (companyName, vatNumber sur client) ne sont pas dans les types Project/User).
export interface FacturXDoc {
  payer?: IBillingPayer | null
  creditedInvoice?: Types.ObjectId | null
  taxTotal?: number
  number?: string
  type?: string
  total?: number
  currency?: string
  lines?: FacturXLine[]
  issuedAt?: Date | string | null
  createdAt?: Date | string | null
}

export interface FacturXClient {
  companyName?: string
  name?: string
  vatNumber?: string
  siret?: string
  email?: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    zip?: string
    city?: string
    country?: string
  }
}

export function billingBuyer(
  payer: IBillingPayer | null | undefined,
  client: FacturXClient | null | undefined,
  subsidiary: { name?: string } | null | undefined,
): FacturXClient | null {
  const contact = payer?.billingContact
  if (contact?.name?.trim()) {
    return {
      name: contact.name,
      email: contact.email,
      siret: contact.siret,
      vatNumber: contact.vatNumber,
      address: {
        line1: contact.addressLine1,
        line2: contact.addressLine2,
        zip: contact.postalCode,
        city: contact.city,
        country: contact.country,
      },
    }
  }
  if (payer?.kind === 'SUBSIDIARY' && subsidiary?.name) return { name: subsidiary.name }
  return client ?? null
}

export interface FacturXProject {
  name?: string
  projectNumber?: string
}

export interface FacturXSettings {
  legalName?: string
  siret?: string
  vatNumber?: string
  currency?: string
  address?: {
    line1?: string
    city?: string
    zip?: string
    country?: string
  }
}

// Génère le XML CrossIndustryInvoice profil MINIMUM.
export function buildFacturXMinimum({
  doc,
  client,
  project,
  settings,
  subsidiary,
}: {
  doc: FacturXDoc
  client?: FacturXClient | null
  project?: FacturXProject | null
  settings?: FacturXSettings | null
  subsidiary?: { name?: string } | null
}): string {
  if (!doc) throw new Error('doc requis pour Factur-X')

  const issueDate = toFormat102(doc.issuedAt || doc.createdAt)
  const currency = doc.currency || (settings && settings.currency) || 'EUR'
  const grandTotal = Number(doc.total || 0)
  // 381 = avoir, 380 = facture commerciale
  const typeCode = grandTotal < 0 ? '381' : '380'

  const totals = aggregateTotals(doc.lines)
  if (doc.creditedInvoice && totals.byRate.length === 1) {
    totals.taxTotal = doc.taxTotal!
    totals.byRate[0]!.tax = doc.taxTotal!
  }
  const { basisTotal, taxTotal, byRate } = totals

  // Si pas de TVA détectée (ex : franchise en base), on construit tout de même
  // une ligne CategoryTradeTax à 0 % pour rester conforme à l'EN 16931.
  const taxBreakdownXml =
    byRate.length > 0
      ? byRate
          .map(
            (b) => `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${toAmount(b.tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${toAmount(b.basis)}</ram:BasisAmount>
        <ram:CategoryCode>${b.rate > 0 ? 'S' : 'E'}</ram:CategoryCode>
        <ram:RateApplicablePercent>${toAmount(b.rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`,
          )
          .join('\n')
      : `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${toAmount(basisTotal)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`

  // Vendeur (CompanySettings)
  const sellerName = (settings && settings.legalName) || 'Vendeur'
  const sellerSiret = (settings && settings.siret) || ''
  const sellerVat = (settings && settings.vatNumber) || ''
  const sellerAddrLine1 = settings?.address?.line1 || ''
  const sellerCity = settings?.address?.city || ''
  const sellerZip = settings?.address?.zip || ''
  const sellerCountry = settings?.address?.country || 'France'
  const sellerCountryCode = countryToIsoCode(sellerCountry)

  const sellerIdBlock = sellerSiret
    ? `        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0009">${esc(sellerSiret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>`
    : ''
  const sellerVatBlock = sellerVat
    ? `        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(sellerVat)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
    : ''
  const sellerAddressBlock =
    sellerAddrLine1 || sellerCity || sellerZip
      ? `        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(sellerZip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(sellerAddrLine1)}</ram:LineOne>
          <ram:CityName>${esc(sellerCity)}</ram:CityName>
          <ram:CountryID>${esc(sellerCountryCode)}</ram:CountryID>
        </ram:PostalTradeAddress>`
      : ''

  const buyer = billingBuyer(doc.payer, client, subsidiary)
  const buyerName = (buyer && (buyer.companyName || buyer.name)) || (project && project.name) || 'Client'
  const buyerAddress = buyer?.address
  const buyerAddressBlock =
    buyerAddress && (buyerAddress.line1 || buyerAddress.zip || buyerAddress.city)
      ? `        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(buyerAddress.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(buyerAddress.line1)}</ram:LineOne>
          <ram:LineTwo>${esc(buyerAddress.line2)}</ram:LineTwo>
          <ram:CityName>${esc(buyerAddress.city)}</ram:CityName>
          <ram:CountryID>${esc(countryToIsoCode(buyerAddress.country))}</ram:CountryID>
        </ram:PostalTradeAddress>`
      : ''
  const buyerVat = buyer?.vatNumber || ''
  const buyerSiret = buyer?.siret || ''
  const buyerIdBlock = buyerSiret
    ? `        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0009">${esc(buyerSiret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>`
    : ''
  const buyerVatBlock = buyerVat
    ? `        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${esc(buyerVat)}</ram:ID>
        </ram:SpecifiedTaxRegistration>`
    : ''

  const buyerReferenceXml = project?.projectNumber
    ? `    <ram:BuyerReference>${esc(project.projectNumber)}</ram:BuyerReference>`
    : ''

  // Le profil MINIMUM exige aussi un total à payer (DuePayableAmount).
  // Ici on considère qu'aucun acompte préalable n'a été versé.
  const duePayable = grandTotal

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${FACTURX_GUIDELINE_MINIMUM}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(doc.number || '')}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
${buyerReferenceXml}
      <ram:SellerTradeParty>
        <ram:Name>${esc(sellerName)}</ram:Name>
${sellerIdBlock}
${sellerAddressBlock}
${sellerVatBlock}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(buyerName)}</ram:Name>
${buyerIdBlock}
${buyerAddressBlock}
${buyerVatBlock}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(currency)}</ram:InvoiceCurrencyCode>
${taxBreakdownXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>${toAmount(basisTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(currency)}">${toAmount(taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${toAmount(grandTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${toAmount(duePayable)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`
}

// Conversion grossière nom de pays → code ISO 3166-1 alpha-2.
function countryToIsoCode(name: string | null | undefined): string {
  if (!name) return 'FR'
  const normalized = String(name).trim().toUpperCase()
  // Si on a déjà un code à 2 lettres on le réutilise.
  if (/^[A-Z]{2}$/.test(normalized)) return normalized
  const map: Record<string, string> = {
    FRANCE: 'FR',
    BELGIQUE: 'BE',
    BELGIUM: 'BE',
    SUISSE: 'CH',
    SWITZERLAND: 'CH',
    LUXEMBOURG: 'LU',
    ALLEMAGNE: 'DE',
    GERMANY: 'DE',
    ESPAGNE: 'ES',
    SPAIN: 'ES',
    ITALIE: 'IT',
    ITALY: 'IT',
    'ROYAUME-UNI': 'GB',
    'UNITED KINGDOM': 'GB',
    UK: 'GB',
    PORTUGAL: 'PT',
    'PAYS-BAS': 'NL',
    NETHERLANDS: 'NL',
    USA: 'US',
    'UNITED STATES': 'US',
    CANADA: 'CA',
  }
  return map[normalized] || 'FR'
}
