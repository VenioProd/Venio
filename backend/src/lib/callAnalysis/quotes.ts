import type { TranscriptSegment } from './schema.js'

/**
 * Vérification des citations. Les citations natives de l'API ne se combinent
 * pas avec la sortie structurée : le modèle recopie la phrase, le serveur
 * vérifie qu'elle figure dans le transcript.
 *
 * Comparaison normalisée : casse, accents, ponctuation et espaces ignorés.
 * La citation doit tenir dans une prise de parole (segments consécutifs d'un
 * même locuteur) : on ne fabrique pas une phrase en recollant deux voix.
 * Une citation de moins de MIN_QUOTE_CHARS caractères utiles (« oui ») ne
 * prouve rien et n'est jamais vérifiée.
 */
export const MIN_QUOTE_CHARS = 8

export type TranscriptIndex = string[]

export function normalizeForQuote(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function indexTranscript(segments: TranscriptSegment[]): TranscriptIndex {
  const turns: string[] = []
  let previous: TranscriptSegment['speaker'] | null = null
  for (const segment of segments) {
    const text = normalizeForQuote(segment.text)
    if (!text) continue
    if (segment.speaker === previous && turns.length > 0) turns[turns.length - 1] += ` ${text}`
    else turns.push(text)
    previous = segment.speaker
  }
  return turns
}

export function isQuoteInTranscript(quote: string | null | undefined, transcript: TranscriptIndex): boolean {
  const needle = normalizeForQuote(quote ?? '')
  if (needle.replace(/ /g, '').length < MIN_QUOTE_CHARS) return false
  return transcript.some((turn) => ` ${turn} `.includes(` ${needle} `))
}
