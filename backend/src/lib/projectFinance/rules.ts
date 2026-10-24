import { FULL_BP, assertBp, assertCents, divHalfUp, floorBp, moneyError } from './money.js'

/**
 * Règles de calcul de l'espace comptabilité par projet, en fonctions pures.
 * Chaque règle renvoie à sa section du cadrage (docs/comptabilite-projets/cadrage.md, § 4).
 * Dans chaque découpage, une seule part reçoit le reste : la somme tombe juste par construction.
 */

export interface PercentPart<K extends string = string> {
  key: K
  bp: number
}

export interface CentsPart<K extends string = string> {
  key: K
  cents: number
}

function assertUniqueKeys(parts: { key: string }[], label: string): void {
  const seen = new Set<string>()
  for (const p of parts) {
    if (seen.has(p.key)) throw moneyError(`${label} : « ${p.key} » apparaît deux fois`)
    seen.add(p.key)
  }
}

function sumBp(parts: PercentPart[]): number {
  return parts.reduce((s, p) => s + p.bp, 0)
}

/**
 * Découpe un total en parts dont les % font exactement 100 % ; la part `residualKey`
 * reçoit le reste au lieu de son floorBp.
 */
function splitFull<K extends string>(
  totalCents: number,
  parts: PercentPart<K>[],
  residualKey: K,
  label: string,
): CentsPart<K>[] {
  assertCents(totalCents)
  if (parts.length === 0) throw moneyError(`${label} : aucune part`)
  assertUniqueKeys(parts, label)
  for (const p of parts) {
    assertBp(p.bp, `${label} « ${p.key} »`)
    if (p.bp === 0) throw moneyError(`${label} « ${p.key} » : pourcentage nul`)
  }
  if (sumBp(parts) !== FULL_BP) {
    throw moneyError(`${label} : la somme des pourcentages fait ${sumBp(parts)} bp au lieu de ${FULL_BP}`)
  }
  if (!parts.some((p) => p.key === residualKey))
    throw moneyError(`${label} : part résiduelle « ${residualKey} » absente`)

  let allocated = 0
  const result = parts.map((p) => {
    if (p.key === residualKey) return { key: p.key, cents: 0 }
    const cents = floorBp(totalCents, p.bp)
    allocated += cents
    return { key: p.key, cents }
  })
  result.find((r) => r.key === residualKey)!.cents = totalCents - allocated
  return result
}

/** R1 — Échéancier : chaque échéance prend floorBp(total, %), la dernière (solde) prend le reste. */
export function splitSchedule<K extends string>(totalHtCents: number, installments: PercentPart<K>[]): CentsPart<K>[] {
  if (totalHtCents < 0) throw moneyError('Échéancier : total HT négatif')
  const last = installments[installments.length - 1]
  if (!last) throw moneyError('Échéancier : aucune échéance')
  return splitFull(totalHtCents, installments, last.key, 'Échéancier')
}

/** R2 — Payeurs d'une échéance : chacun prend floorBp(HT, quote-part), le payeur principal prend le reste. */
export function splitPayers<K extends string>(
  htCents: number,
  payers: PercentPart<K>[],
  principalKey: K,
): CentsPart<K>[] {
  if (htCents < 0) throw moneyError('Payeurs : montant HT négatif')
  return splitFull(htCents, payers, principalKey, 'Payeurs')
}

/**
 * R3 — HT cumulé encaissé sur une facture, à partir du cumul TTC encaissé.
 * Facture soldée : exactement son HT. Sinon divHalfUp(cumul × HT, TTC).
 */
export function cumulativeHt(cumulTtcCents: number, invoiceHtCents: number, invoiceTtcCents: number): number {
  assertCents(cumulTtcCents, 'cumul encaissé')
  assertCents(invoiceHtCents, 'HT facture')
  assertCents(invoiceTtcCents, 'TTC facture')
  if (invoiceTtcCents <= 0 || invoiceHtCents < 0 || invoiceHtCents > invoiceTtcCents) {
    throw moneyError('Facture incohérente : il faut 0 ≤ HT ≤ TTC et TTC > 0')
  }
  if (cumulTtcCents < 0) throw moneyError('Le cumul encaissé ne peut pas être négatif')
  if (cumulTtcCents > invoiceTtcCents) throw moneyError('Le cumul encaissé dépasse le TTC de la facture')
  if (cumulTtcCents === invoiceTtcCents) return invoiceHtCents
  return divHalfUp(BigInt(cumulTtcCents) * BigInt(invoiceHtCents), invoiceTtcCents)
}

/**
 * R3 — HT d'un encaissement (positif) ou d'un remboursement (négatif) :
 * différence des HT cumulés avant et après. Refuse tout dépassement du reste dû.
 */
export function paymentHt(
  previousCumulTtcCents: number,
  paymentTtcCents: number,
  invoiceHtCents: number,
  invoiceTtcCents: number,
): number {
  assertCents(paymentTtcCents, 'encaissement')
  if (paymentTtcCents === 0) throw moneyError('Encaissement nul')
  const before = cumulativeHt(previousCumulTtcCents, invoiceHtCents, invoiceTtcCents)
  const after = cumulativeHt(previousCumulTtcCents + paymentTtcCents, invoiceHtCents, invoiceTtcCents)
  return after - before
}

export interface ShareAllocationResult<K extends string = string> {
  beneficiaries: CentsPart<K>[]
  companyCents: number
}

function assertShareRules(rules: PercentPart[]): void {
  assertUniqueKeys(rules, 'Règles de répartition')
  for (const r of rules) assertBp(r.bp, `Règle « ${r.key} »`)
  if (sumBp(rules) > FULL_BP) {
    throw moneyError(`Règles de répartition : ${sumBp(rules)} bp attribués, plus que ${FULL_BP}`)
  }
}

/** R4 — Répartition d'un encaissement : floorBp par bénéficiaire, la société prend le reste. */
export function allocatePayment<K extends string>(
  baseHtCents: number,
  rules: PercentPart<K>[],
): ShareAllocationResult<K> {
  assertCents(baseHtCents, 'base HT')
  if (baseHtCents < 0) throw moneyError('Répartition : base négative (un remboursement passe par refundRegularisation)')
  assertShareRules(rules)
  const beneficiaries = rules.map((r) => ({ key: r.key, cents: floorBp(baseHtCents, r.bp) }))
  const companyCents = baseHtCents - beneficiaries.reduce((s, b) => s + b.cents, 0)
  return { beneficiaries, companyCents }
}

/**
 * R6 — Régularisation d'un remboursement imputé sur un encaissement de base `baseHtCents`
 * (sa base nette avant ce remboursement), avec les règles de cet encaissement.
 * Un remboursement total annule exactement les parts d'origine.
 */
export function refundRegularisation<K extends string>(
  baseHtCents: number,
  refundHtCents: number,
  rules: PercentPart<K>[],
): ShareAllocationResult<K> {
  assertCents(baseHtCents, 'base HT')
  assertCents(refundHtCents, 'HT remboursé')
  if (refundHtCents <= 0) throw moneyError('Remboursement : le HT remboursé doit être positif')
  if (refundHtCents > baseHtCents)
    throw moneyError("Remboursement : le HT remboursé dépasse la base nette de l'encaissement")
  assertShareRules(rules)
  const netBase = baseHtCents - refundHtCents
  const beneficiaries = rules.map((r) => ({ key: r.key, cents: floorBp(netBase, r.bp) - floorBp(baseHtCents, r.bp) }))
  const companyCents = -refundHtCents - beneficiaries.reduce((s, b) => s + b.cents, 0)
  return { beneficiaries, companyCents }
}

export interface RuleVersion<K extends string = string> {
  version: number
  effectiveFrom: Date
  rules: PercentPart<K>[]
}

/** R5 — Version de règles en vigueur à une date : la plus récente dont la date d'effet est atteinte. */
export function ruleVersionAt<K extends string>(versions: RuleVersion<K>[], at: Date): RuleVersion<K> {
  let found: RuleVersion<K> | null = null
  for (const v of versions) {
    if (v.effectiveFrom.getTime() > at.getTime()) continue
    if (
      !found ||
      v.effectiveFrom.getTime() > found.effectiveFrom.getTime() ||
      (v.effectiveFrom.getTime() === found.effectiveFrom.getTime() && v.version > found.version)
    ) {
      found = v
    }
  }
  if (!found) throw moneyError(`Aucune règle de répartition en vigueur au ${at.toISOString().slice(0, 10)}`)
  return found
}

/** R5 — Une nouvelle version ne peut pas précéder le dernier encaissement réparti du projet. */
export function assertVersionEffectiveDate(effectiveFrom: Date, lastAllocatedPaymentAt: Date | null): void {
  if (lastAllocatedPaymentAt && effectiveFrom.getTime() < lastAllocatedPaymentAt.getTime()) {
    throw moneyError('La nouvelle version ne peut pas prendre effet avant le dernier encaissement déjà réparti')
  }
}

export interface Statement {
  dueCents: number
  paidCents: number
  remainingCents: number
}

/** R7 — Relevé : dû = Σ parts (régularisations comprises), versé = Σ versements HT, restant = dû − versé. */
export function beneficiaryStatement(allocationCents: number[], settlementHtCents: number[]): Statement {
  for (const c of allocationCents) assertCents(c, 'part')
  for (const c of settlementHtCents) {
    assertCents(c, 'versement')
    if (c <= 0) throw moneyError('Un versement doit être positif')
  }
  const dueCents = allocationCents.reduce((s, c) => s + c, 0)
  const paidCents = settlementHtCents.reduce((s, c) => s + c, 0)
  return { dueCents, paidCents, remainingCents: dueCents - paidCents }
}

export function subscriptionPeriodStart(
  startDate: Date,
  period: 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
  index: number,
): Date {
  if (!Number.isSafeInteger(index) || index < 0 || !Number.isFinite(startDate.getTime())) {
    throw moneyError('Période d’abonnement invalide')
  }
  const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[period]
  const first = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months * index, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(startDate.getUTCDate(), lastDay))
  if (!Number.isFinite(first.getTime())) throw moneyError('Date de période hors limites')
  return first
}

export function subscriptionPeriodEnd(
  startDate: Date,
  period: 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
  index: number,
): Date {
  const end = subscriptionPeriodStart(startDate, period, index + 1)
  end.setUTCDate(end.getUTCDate() - 1)
  return end
}
