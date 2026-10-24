/**
 * Arithmétique monétaire de l'espace comptabilité par projet.
 *
 * Conventions (docs/comptabilite-projets/cadrage.md, § 3) :
 *   - montants en centimes entiers ;
 *   - pourcentages en points de base entiers (1 bp = 0,01 %, 100 % = 10 000 bp) ;
 *   - deux arrondis seulement : `floorBp` pour toutes les parts, `divHalfUp`
 *     pour la TVA et la conversion TTC → HT.
 *
 * Les calculs intermédiaires passent par BigInt : un produit centimes × centimes
 * dépasse vite Number.MAX_SAFE_INTEGER (une facture de 100 000 € fait déjà 10^7).
 */

export const FULL_BP = 10_000

export type MoneyError = Error & { status?: number }

export function moneyError(message: string): MoneyError {
  const err = new Error(message) as MoneyError
  err.status = 400
  return err
}

export function assertCents(value: number, label = 'montant'): void {
  if (!Number.isSafeInteger(value)) {
    throw moneyError(`${label} invalide : ${value} n'est pas un nombre entier de centimes`)
  }
}

export function assertBp(value: number, label = 'pourcentage'): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > FULL_BP) {
    throw moneyError(`${label} invalide : ${value} bp (attendu un entier entre 0 et ${FULL_BP})`)
  }
}

function toSafeNumber(value: bigint): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n)) throw moneyError(`Montant hors limites : ${value}`)
  return n
}

/**
 * Euros décimaux (BillingDocument, saisies) → centimes.
 * `toPrecision(15)` absorbe le bruit des flottants (1,005 × 100 = 100,4999…) avant
 * l'arrondi au demi supérieur, appliqué symétriquement aux négatifs.
 */
export function toCents(euros: number): number {
  if (!Number.isFinite(euros)) throw moneyError(`Montant en euros invalide : ${euros}`)
  if (Math.abs(euros) >= 1e12) throw moneyError(`Montant hors limites : ${euros}`)
  const scaled = Number((Math.abs(euros) * 100).toPrecision(15))
  const cents = Math.sign(euros) * Math.round(scaled)
  if (!Number.isSafeInteger(cents)) throw moneyError(`Montant hors limites : ${euros}`)
  return cents === 0 ? 0 : cents
}

/** Part `bp` d'un montant, arrondie vers −∞ (le bénéficiaire n'est jamais surpayé). */
export function floorBp(cents: number, bp: number): number {
  assertCents(cents)
  assertBp(bp)
  const n = BigInt(cents) * BigInt(bp)
  const d = BigInt(FULL_BP)
  let q = n / d
  if (n % d !== 0n && n < 0n) q -= 1n
  return toSafeNumber(q)
}

/** n / d arrondi au plus proche, demi éloigné de zéro. d doit être strictement positif. */
export function divHalfUp(n: number | bigint, d: number | bigint): number {
  const num = BigInt(n)
  const den = BigInt(d)
  if (den <= 0n) throw moneyError('Division par un dénominateur nul ou négatif')
  const sign = num < 0n ? -1n : 1n
  const abs = num * sign
  return toSafeNumber(sign * ((2n * abs + den) / (2n * den)))
}

/** TVA d'un montant HT, au demi-centime supérieur. */
export function vatCents(htCents: number, rateBp: number): number {
  assertCents(htCents, 'montant HT')
  assertBp(rateBp, 'taux de TVA')
  return divHalfUp(BigInt(htCents) * BigInt(rateBp), FULL_BP)
}
