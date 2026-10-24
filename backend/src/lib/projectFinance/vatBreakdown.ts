import { invoiceAmountsCents } from './invoicing.js'
import { assertBp, assertCents, moneyError, toCents, vatCents } from './money.js'

interface VatDocument {
  lines?: { total?: number; taxRate?: number }[]
  subtotal?: number
  taxTotal?: number
  total?: number
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
  if (largest) {
    largest.htCents += htDifference
    largest.taxCents += taxDifference
    assertCents(largest.htCents, 'Base HT rapprochée')
    assertCents(largest.taxCents, 'TVA rapprochée')
  }
  return grouped
}
