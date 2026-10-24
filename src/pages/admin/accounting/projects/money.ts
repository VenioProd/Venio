const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export function formatMoney(cents: number): string {
  return euro.format(cents / 100)
}

export function parseMoney(value: string, allowZero = false): number {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new Error('Saisissez un montant positif avec deux décimales au maximum.')
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw new Error('Le montant doit être strictement positif et dans les limites autorisées.')
  }
  return cents
}

export function formatPercent(bp: number): string {
  return `${(bp / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`
}
