import type { BetaStep } from '../../services/beta'

/**
 * Les campagnes réelles glissent des avertissements dans le résultat attendu,
 * préfixés « PIÈGE : » — l'information la plus précieuse d'une étape, mêlée au
 * texte le moins lisible de l'écran.
 *
 * On la reconnaît à l'affichage plutôt que d'ajouter un champ : les campagnes
 * déjà écrites en profitent sans être ressaisies.
 */
const TRAP_PREFIX = /(?:^|[.\s])(?:PIÈGE|PIEGE|ATTENTION)\s*:\s*/iu

export interface ReadableStep {
  order: number
  instruction: string
  /** Le résultat attendu, débarrassé de l'avertissement. */
  expected: string
  /** L'avertissement, s'il y en a un. */
  watchOut: string | null
}

export function toReadableStep(step: BetaStep): ReadableStep {
  const expected = step.expected ?? ''
  const match = TRAP_PREFIX.exec(expected)

  if (!match || match.index === undefined) {
    return { order: step.order, instruction: step.instruction, expected: expected.trim(), watchOut: null }
  }

  return {
    order: step.order,
    instruction: step.instruction,
    expected: expected
      .slice(0, match.index)
      .trim()
      .replace(/[.\s]+$/, ''),
    watchOut: expected.slice(match.index + match[0].length).trim() || null,
  }
}

/**
 * Une consigne de posture — « à faire sur téléphone », « avec un compte neuf »
 * — invalide le test si on la rate. Reconnue sur la description pour être
 * montrée comme une condition, pas comme du texte d'ambiance.
 */
// `\b` est une frontière ASCII : elle ne se produit pas devant un « À ».
// On borne donc sur « pas une lettre », ce qui vaut pour tout l'alphabet.
const PRECONDITION = /(?:^|[^\p{L}])(?:à faire|ne pas|jamais|au moins une fois|uniquement)(?![\p{L}])/iu

export function looksLikePrecondition(sentence: string): boolean {
  return PRECONDITION.test(sentence)
}

/** Découpe une description en phrases, pour isoler celles qui sont des consignes. */
export function splitPreconditions(description: string): { intro: string; conditions: string[] } {
  const sentences = description
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean)

  const conditions = sentences.filter(looksLikePrecondition)
  const intro = sentences.filter((s) => !looksLikePrecondition(s)).join(' ')
  return { intro, conditions }
}
