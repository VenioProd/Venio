import type { TranscriptSegment } from '../../services/callInsights'

/**
 * Recherche tolérante dans un transcript : casse, accents, ponctuation et espaces sont ignorés
 * (même idée que la vérification des citations côté serveur). Chaque caractère normalisé garde
 * la position du caractère d'origine, pour pouvoir surligner le texte tel qu'il est affiché.
 */

interface NormalizedText {
  text: string
  /** Pour chaque caractère normalisé : [indice du segment, indice dans le texte du segment] ; -1 = séparateur. */
  origin: [number, number][]
}

const SEPARATOR: [number, number] = [-1, -1]

function pushNormalized(text: string, segment: number, out: NormalizedText) {
  let offset = 0
  for (const char of text) {
    const base = char.normalize('NFD').replace(/\p{M}/gu, '')
    for (const piece of base.toLowerCase()) {
      if (/[\p{L}\p{N}]/u.test(piece)) {
        out.text += piece
        out.origin.push([segment, offset])
      } else if (!out.text.endsWith(' ')) {
        out.text += ' '
        out.origin.push([segment, offset])
      }
    }
    offset += char.length
  }
}

export function normalizeText(value: string): string {
  const out: NormalizedText = { text: '', origin: [] }
  pushNormalized(value, 0, out)
  return out.text.trim()
}

export function indexSegments(segments: TranscriptSegment[]): NormalizedText {
  const out: NormalizedText = { text: '', origin: [] }
  segments.forEach((segment, index) => {
    if (out.text && !out.text.endsWith(' ')) {
      out.text += ' '
      out.origin.push(SEPARATOR)
    }
    pushNormalized(segment.text, index, out)
  })
  return out
}

/** Intervalles [début, fin) à surligner dans chaque segment, par indice de segment. */
export type SegmentRanges = Map<number, [number, number][]>

/** Toutes les occurrences (sans chevauchement) de `needle` ; une occurrence peut s'étendre sur plusieurs segments. */
export function findOccurrences(index: NormalizedText, needle: string): SegmentRanges[] {
  const wanted = normalizeText(needle)
  if (!wanted) return []
  const found: SegmentRanges[] = []
  let from = 0
  for (;;) {
    const at = index.text.indexOf(wanted, from)
    if (at < 0) break
    const ranges: SegmentRanges = new Map()
    for (let i = at; i < at + wanted.length; i++) {
      const [segment, offset] = index.origin[i]
      if (segment < 0) continue
      const current = ranges.get(segment)
      if (!current) ranges.set(segment, [[offset, offset + 1]])
      else current[0] = [Math.min(current[0][0], offset), Math.max(current[0][1], offset + 1)]
    }
    found.push(ranges)
    from = at + wanted.length
  }
  return found
}

/** Horodatage `m:ss` (ou `h:mm:ss`) d'un décalage en millisecondes. */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, '0')
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}
