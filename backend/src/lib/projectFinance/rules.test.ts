import { describe, expect, it } from 'vitest'
import { vatCents } from './money.js'
import {
  allocatePayment,
  assertVersionEffectiveDate,
  beneficiaryStatement,
  cumulativeHt,
  paymentHt,
  refundRegularisation,
  ruleVersionAt,
  splitPayers,
  splitSchedule,
  type PercentPart,
} from './rules.js'

// Exemples de docs/comptabilite-projets/cadrage.md, § 4 — « Projet Démo », TVA 20 %.
const VAT = 2000
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const byKey = (parts: { key: string; cents: number }[]) => Object.fromEntries(parts.map((p) => [p.key, p.cents]))

type B = 'commercial' | 'freelance' | 'apporteur' | 'associeA' | 'associeB'
const RULES_V1: PercentPart<B>[] = [
  { key: 'commercial', bp: 1000 },
  { key: 'freelance', bp: 3500 },
  { key: 'apporteur', bp: 500 },
  { key: 'associeA', bp: 2000 },
  { key: 'associeB', bp: 2000 },
]
const RULES_V2: PercentPart<B>[] = RULES_V1.map((r) => (r.key === 'freelance' ? { ...r, bp: 3000 } : r))

// Facture client de l'acompte (R2) : 999,90 HT, 1 199,88 TTC.
const INVOICE_HT = 99990
const INVOICE_TTC = 119988

describe('R1 — échéancier en %', () => {
  it('découpe 9 999,99 € en 33,33 / 33,33 / 33,34 %, le solde prend le reste', () => {
    const parts = splitSchedule(999999, [
      { key: 'acompte', bp: 3333 },
      { key: 'jalon', bp: 3333 },
      { key: 'solde', bp: 3334 },
    ])
    expect(byKey(parts)).toEqual({ acompte: 333299, jalon: 333299, solde: 333401 })
    const vat = parts.map((p) => vatCents(p.cents, VAT))
    expect(vat).toEqual([66660, 66660, 66680])
    expect(sum(parts.map((p) => p.cents))).toBe(999999)
    expect(sum(vat)).toBe(200000)
    expect(sum(parts.map((p, i) => p.cents + vat[i]!))).toBe(1199999)
  })

  it('un forfait simple est une échéance unique de 100 %', () => {
    expect(byKey(splitSchedule(123457, [{ key: 'unique', bp: 10000 }]))).toEqual({ unique: 123457 })
  })

  it('refuse un échéancier qui ne fait pas 100 %', () => {
    expect(() =>
      splitSchedule(1000, [
        { key: 'a', bp: 5000 },
        { key: 'b', bp: 4999 },
      ]),
    ).toThrow(/9999/)
    expect(() =>
      splitSchedule(1000, [
        { key: 'a', bp: 10000 },
        { key: 'b', bp: 0 },
      ]),
    ).toThrow(/nul/)
    expect(() => splitSchedule(1000, [])).toThrow()
  })
})

describe('R2 — payeurs d’une échéance', () => {
  it('OPCO 70 % / client principal 30 % sur 3 332,99 €', () => {
    const parts = splitPayers(
      333299,
      [
        { key: 'opco', bp: 7000 },
        { key: 'client', bp: 3000 },
      ],
      'client',
    )
    expect(byKey(parts)).toEqual({ opco: 233309, client: 99990 })
    expect(vatCents(233309, VAT)).toBe(46662)
    expect(vatCents(99990, VAT)).toBe(19998)
    expect(233309 + 46662).toBe(279971)
    expect(99990 + 19998).toBe(INVOICE_TTC)
    // Recoupe la ligne « Acompte » de R1.
    expect(233309 + 99990).toBe(333299)
    expect(46662 + 19998).toBe(66660)
  })

  it('exige un payeur principal présent et des quotes-parts à 100 %', () => {
    expect(() => splitPayers(1000, [{ key: 'a', bp: 10000 }], 'b' as 'a')).toThrow(/résiduelle/)
    expect(() =>
      splitPayers(
        1000,
        [
          { key: 'a', bp: 6000 },
          { key: 'a', bp: 4000 },
        ],
        'a',
      ),
    ).toThrow(/deux fois/)
  })
})

describe('R3 — HT encaissé', () => {
  it('trois encaissements partiels retombent exactement sur le HT de la facture', () => {
    const payments = [40000, 40000, 39988]
    let cumul = 0
    const hts = payments.map((p) => {
      const ht = paymentHt(cumul, p, INVOICE_HT, INVOICE_TTC)
      cumul += p
      return ht
    })
    expect(hts).toEqual([33333, 33334, 33323])
    expect(sum(hts)).toBe(INVOICE_HT)
    expect(cumulativeHt(40000, INVOICE_HT, INVOICE_TTC)).toBe(33333)
    expect(cumulativeHt(80000, INVOICE_HT, INVOICE_TTC)).toBe(66667)
  })

  it('reste exact pour une facture soldée en un paiement dont le ratio n’est pas rond', () => {
    expect(paymentHt(0, 100001, 83334, 100001)).toBe(83334)
  })

  it('refuse un encaissement qui dépasse le reste dû, un cumul négatif ou un montant nul', () => {
    expect(() => paymentHt(119000, 1000, INVOICE_HT, INVOICE_TTC)).toThrow(/dépasse/)
    expect(() => paymentHt(0, -1, INVOICE_HT, INVOICE_TTC)).toThrow(/négatif/)
    expect(() => paymentHt(0, 0, INVOICE_HT, INVOICE_TTC)).toThrow(/nul/)
  })
})

describe('R4 — répartition d’un encaissement', () => {
  it('E1, base 333,33 €, règles v1', () => {
    const r = allocatePayment(33333, RULES_V1)
    expect(byKey(r.beneficiaries)).toEqual({
      commercial: 3333,
      freelance: 11666,
      apporteur: 1666,
      associeA: 6666,
      associeB: 6666,
    })
    expect(r.companyCents).toBe(3336)
    expect(sum(r.beneficiaries.map((b) => b.cents)) + r.companyCents).toBe(33333)
  })

  it('refuse plus de 100 % attribués, un bénéficiaire en double ou une base négative', () => {
    expect(() =>
      allocatePayment(100, [
        { key: 'a', bp: 6000 },
        { key: 'b', bp: 4001 },
      ]),
    ).toThrow(/10001/)
    expect(() =>
      allocatePayment(100, [
        { key: 'a', bp: 10 },
        { key: 'a', bp: 10 },
      ]),
    ).toThrow(/deux fois/)
    expect(() => allocatePayment(-100, RULES_V1)).toThrow(/négative/)
  })

  it('sans règle, tout reste en société', () => {
    expect(allocatePayment(12345, [])).toEqual({ beneficiaries: [], companyCents: 12345 })
  })
})

describe('R5 — changement de % en cours de projet', () => {
  const versions = [
    { version: 1, effectiveFrom: new Date('2026-09-01'), rules: RULES_V1 },
    { version: 2, effectiveFrom: new Date('2026-10-10'), rules: RULES_V2 },
  ]

  it('chaque encaissement prend la version en vigueur à sa date, et le total recoupe le HT de la facture', () => {
    const payments = [
      { at: new Date('2026-10-01'), base: 33333 },
      { at: new Date('2026-10-15'), base: 33334 },
      { at: new Date('2026-11-01'), base: 33323 },
    ]
    const results = payments.map((p) => allocatePayment(p.base, ruleVersionAt(versions, p.at).rules))
    expect(results.map((r) => byKey(r.beneficiaries).freelance)).toEqual([11666, 10000, 9996])
    expect(results.map((r) => r.companyCents)).toEqual([3336, 5003, 5001])

    const totals = (key: B) => sum(results.map((r) => byKey(r.beneficiaries)[key]!))
    expect({
      commercial: totals('commercial'),
      freelance: totals('freelance'),
      apporteur: totals('apporteur'),
      associeA: totals('associeA'),
      associeB: totals('associeB'),
      societe: sum(results.map((r) => r.companyCents)),
    }).toEqual({
      commercial: 9998,
      freelance: 31662,
      apporteur: 4998,
      associeA: 19996,
      associeB: 19996,
      societe: 13340,
    })
    expect(9998 + 31662 + 4998 + 19996 + 19996 + 13340).toBe(INVOICE_HT)
  })

  it('aucune règle avant la première version', () => {
    expect(() => ruleVersionAt(versions, new Date('2026-08-31'))).toThrow(/Aucune règle/)
  })

  it('à date d’effet égale, la version la plus haute l’emporte', () => {
    const same = [...versions, { version: 3, effectiveFrom: new Date('2026-10-10'), rules: [] }]
    expect(ruleVersionAt(same, new Date('2026-10-10')).version).toBe(3)
  })

  it('refuse une date d’effet antérieure au dernier encaissement réparti', () => {
    expect(() => assertVersionEffectiveDate(new Date('2026-10-01'), new Date('2026-10-15'))).toThrow()
    expect(() => assertVersionEffectiveDate(new Date('2026-10-15'), new Date('2026-10-15'))).not.toThrow()
    expect(() => assertVersionEffectiveDate(new Date('2026-10-01'), null)).not.toThrow()
  })
})

describe('R6 — remboursement après répartition', () => {
  it('150,00 € TTC remboursés sur la facture soldée valent 125,00 € HT', () => {
    expect(paymentHt(INVOICE_TTC, -15000, INVOICE_HT, INVOICE_TTC)).toBe(-12500)
    expect(cumulativeHt(INVOICE_TTC - 15000, INVOICE_HT, INVOICE_TTC)).toBe(87490)
  })

  it('régularise les parts de E1 sur sa base nette de 208,33 €', () => {
    const r = refundRegularisation(33333, 12500, RULES_V1)
    expect(byKey(r.beneficiaries)).toEqual({
      commercial: -1250,
      freelance: -4375,
      apporteur: -625,
      associeA: -2500,
      associeB: -2500,
    })
    expect(r.companyCents).toBe(-1250)
    expect(sum(r.beneficiaries.map((b) => b.cents)) + r.companyCents).toBe(-12500)

    // Parts après régularisation = répartition directe de la base nette.
    const original = allocatePayment(33333, RULES_V1)
    const direct = allocatePayment(20833, RULES_V1)
    for (const b of direct.beneficiaries) {
      expect(byKey(original.beneficiaries)[b.key]! + byKey(r.beneficiaries)[b.key]!).toBe(b.cents)
    }
    expect(original.companyCents + r.companyCents).toBe(direct.companyCents)
  })

  it('un remboursement total annule exactement les parts d’origine', () => {
    const original = allocatePayment(33333, RULES_V1)
    const r = refundRegularisation(33333, 33333, RULES_V1)
    expect(r.beneficiaries.map((b) => b.cents)).toEqual(original.beneficiaries.map((b) => -b.cents))
    expect(r.companyCents).toBe(-original.companyCents)
  })

  it('refuse un remboursement nul ou supérieur à la base nette', () => {
    expect(() => refundRegularisation(33333, 0, RULES_V1)).toThrow()
    expect(() => refundRegularisation(33333, 33334, RULES_V1)).toThrow(/dépasse/)
  })
})

describe('R7 — relevé du freelance et invariant projet', () => {
  it('dû 272,87 €, versé 116,66 €, restant 156,21 €', () => {
    expect(beneficiaryStatement([11666, 10000, 9996, -4375], [11666])).toEqual({
      dueCents: 27287,
      paidCents: 11666,
      remainingCents: 15621,
    })
  })

  it('un versement doit être positif', () => {
    expect(() => beneficiaryStatement([100], [0])).toThrow()
  })

  it('toutes les parts du projet, société comprise, égalent le HT encaissé net', () => {
    const versions = [
      { version: 1, effectiveFrom: new Date('2026-09-01'), rules: RULES_V1 },
      { version: 2, effectiveFrom: new Date('2026-10-10'), rules: RULES_V2 },
    ]
    const e1 = allocatePayment(33333, ruleVersionAt(versions, new Date('2026-10-01')).rules)
    const e2 = allocatePayment(33334, ruleVersionAt(versions, new Date('2026-10-15')).rules)
    const e3 = allocatePayment(33323, ruleVersionAt(versions, new Date('2026-11-01')).rules)
    const refund = refundRegularisation(33333, 12500, RULES_V1)
    const total = sum([e1, e2, e3, refund].map((r) => sum(r.beneficiaries.map((b) => b.cents)) + r.companyCents))
    expect(total).toBe(87490)
  })
})
