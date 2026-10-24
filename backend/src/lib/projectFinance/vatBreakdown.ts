import { invoiceAmountsCents } from './invoicing.js'
import { assertBp, assertCents, moneyError, toCents, vatCents } from './money.js'

interface VatDocument {
  lines?: { total?: number; taxRate?: number }[]
  subtotal?: number
  taxTotal?: number
  total?: number
}

interface BillingLine {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

export function computeBillingTotals<T extends BillingLine>(lines: T[]) {
  const byRate = new Map<number, number>()
  const roundedLines = lines.map((line) => {
    const cents = toCents(line.quantity * line.unitPrice)
    const bp = Math.round(line.taxRate * 100)
    assertBp(bp, 'Taux de TVA')
    const htCents = (byRate.get(bp) ?? 0) + cents
    assertCents(htCents, 'Base HT par taux')
    byRate.set(bp, htCents)
    return { ...line, total: cents / 100 }
  })
  let htCents = 0
  let taxCents = 0
  for (const [bp, base] of byRate) {
    htCents += base
    taxCents += vatCents(base, bp)
  }
  assertCents(htCents, 'Total HT')
  assertCents(taxCents, 'Total TVA')
  assertCents(htCents + taxCents, 'Total TTC')
  return { lines: roundedLines, subtotal: htCents / 100, taxTotal: taxCents / 100, total: (htCents + taxCents) / 100 }
}

export function billingVatBreakdown(doc: VatDocument) {
  const byRate = new Map<number, number>()
  for (const line of doc.lines ?? []) {
    const bp = Math.round((line.taxRate ?? 0) * 100)
    assertBp(bp, 'Taux de TVA')
    const htCents = (byRate.get(bp) ?? 0) + toCents(line.total ?? 0)
    assertCents(htCents, 'Base HT par taux')
    byRate.set(bp, htCents)
  }
  const grouped = [...byRate]
    .map(([bp, htCents]) => ({
      rate: bp / 100,
      htCents,
      taxCents: vatCents(htCents, bp),
    }))
    .sort((a, b) => b.rate - a.rate)
  const amounts = invoiceAmountsCents({
    subtotal: doc.subtotal ?? 0,
    taxTotal: doc.taxTotal ?? 0,
    total: doc.total ?? 0,
  })
  const htDifference = amounts.htCents - grouped.reduce((sum, group) => sum + group.htCents, 0)
  const taxDifference = amounts.vatCents - grouped.reduce((sum, group) => sum + group.taxCents, 0)
  const tolerance = doc.lines?.length ?? 0
  if (Math.abs(htDifference) > tolerance || Math.abs(taxDifference) > tolerance) {
    throw moneyError('Document incohérent : les lignes ne correspondent pas aux montants HT et TVA')
  }
  const largest = grouped.reduce<(typeof grouped)[number] | undefined>((found, group) => {
    if (!found || Math.abs(group.htCents) > Math.abs(found.htCents)) return group
    return found
  }, undefined)
  const largestTaxable = grouped
    .filter((group) => group.rate > 0)
    .reduce<typeof largest>((found, group) => {
      if (!found || Math.abs(group.htCents) > Math.abs(found.htCents)) return group
      return found
    }, undefined)
  if (largest) {
    largest.htCents += htDifference
    assertCents(largest.htCents, 'Base HT rapprochée')
  }
  if (largestTaxable) {
    largestTaxable.taxCents += taxDifference
    assertCents(largestTaxable.taxCents, 'TVA rapprochée')
  } else if (taxDifference !== 0) {
    throw moneyError('Document incohérent : TVA sans base taxable')
  }
  for (const group of grouped) {
    if (group.htCents * group.taxCents < 0) {
      throw moneyError('Document incohérent : TVA de signe opposé à la base HT')
    }
  }
  return grouped
}
