// BOM UTF-8 — nécessaire pour qu'Excel reconnaisse l'encodage des accents.
const UTF8_BOM = '﻿'

// Une cellule peut contenir un littéral de base, une date ou null/undefined.
export type CsvCell = string | number | boolean | Date | null | undefined

function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let str: string
  if (value instanceof Date) {
    str = value.toISOString()
  } else if (typeof value === 'number') {
    // Conversion FR : on garde le séparateur décimal '.' par défaut.
    // (Excel FR parse les nombres avec '.' si la cellule n'est pas formatée comme texte.)
    str = String(value)
  } else {
    str = String(value)
  }
  // Encadrer par des doubles guillemets si la cellule contient ; " ou un saut de ligne.
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Sérialise un array de rows en CSV (séparateur ';' — convention française pour Excel FR).
 * Encadre les champs contenant ; " ou \n par des doubles guillemets, et échappe les " internes.
 *
 * @param headers ['Code', 'Libellé', 'Débit', ...]
 * @param rows    Chaque row = array dans le même ordre que headers
 * @returns       Le contenu CSV (UTF-8 BOM inclus pour Excel)
 */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const safeHeaders = Array.isArray(headers) ? headers : []
  const safeRows = Array.isArray(rows) ? rows : []

  const lines: string[] = []
  lines.push(safeHeaders.map((h) => escapeCell(h)).join(';'))
  for (const row of safeRows) {
    const cells = Array.isArray(row) ? row : []
    lines.push(cells.map(escapeCell).join(';'))
  }
  return UTF8_BOM + lines.join('\r\n')
}

export default buildCsv
