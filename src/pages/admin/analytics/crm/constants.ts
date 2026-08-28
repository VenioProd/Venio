import type { FunnelStage, PilotagePeriod } from '../../../../types/pilotage.types'

export const STAGE_LABELS: Record<FunnelStage, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualifié',
  CONTACTED: 'Contacté',
  DEMO: 'Démo',
  PROPOSAL: 'Proposition',
  WON: 'Gagné',
}

export const PILOTAGE_PERIODS: { key: PilotagePeriod; label: string }[] = [
  { key: '30d', label: '30 j' },
  { key: '90d', label: '90 j' },
  { key: 'ytd', label: 'Année' },
  { key: '12m', label: '12 mois' },
]

/** Libellé lisible des valeurs que le serveur remonte comme non renseignées. */
export function displayKey(key: string): string {
  return key === 'NON_RENSEIGNE' ? 'Non renseigné' : key
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)} %`
}

export function formatDays(value: number | null): string {
  if (value === null) return '—'
  return value < 1 ? '< 1 j' : `${value} j`
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}
