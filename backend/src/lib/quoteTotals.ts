import type { Types } from 'mongoose'
import type { IQuoteLine } from '../types/models/index.js'

export interface QuoteTotals {
  subtotal: number
  taxTotal: number
  total: number
  lines: IQuoteLine[]
}

type LineId = Types.ObjectId | string

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Les lignes obligatoires sont toujours retenues. Les optionnelles ne le sont
 * que si le client les a explicitement cochées : une sélection vide est une
 * intention, pas une absence de réponse.
 */
export function resolveSelectedLines(lines: IQuoteLine[], selectedIds: LineId[]): IQuoteLine[] {
  const selected = new Set(selectedIds.map(String))
  return lines.filter((line) => !line.isOptional || selected.has(String(line._id)))
}

export function computeQuoteTotals(lines: IQuoteLine[], selectedIds: LineId[]): QuoteTotals {
  const retained = resolveSelectedLines(lines, selectedIds)

  let subtotal = 0
  let taxTotal = 0
  for (const line of retained) {
    const lineSubtotal = roundCents(line.quantity * line.unitPrice)
    subtotal = roundCents(subtotal + lineSubtotal)
    taxTotal = roundCents(taxTotal + roundCents((lineSubtotal * line.taxRate) / 100))
  }

  return { subtotal, taxTotal, total: roundCents(subtotal + taxTotal), lines: retained }
}

export function validateSelection(
  lines: IQuoteLine[],
  selectedIds: LineId[],
): { valid: true } | { valid: false; invalidIds: string[] } {
  const optional = new Set(lines.filter((line) => line.isOptional).map((line) => String(line._id)))
  const invalidIds = selectedIds.map(String).filter((id) => !optional.has(id))
  return invalidIds.length === 0 ? { valid: true } : { valid: false, invalidIds }
}
