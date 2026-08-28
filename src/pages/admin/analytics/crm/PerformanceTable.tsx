import React from 'react'
import type { PerformanceRow } from '../../../../types/pilotage.types'
import { displayKey, formatEuro, formatPercent } from './constants'

interface PerformanceTableProps {
  rows: PerformanceRow[]
  /** Résout un identifiant en nom lisible, pour la ventilation par commercial. */
  resolveLabel?: (key: string) => string
  emptyLabel: string
}

/**
 * Le taux affiché porte sur les affaires **conclues** : rapporter les gains à
 * un total gonflé d'affaires encore ouvertes ferait passer une bonne
 * performance pour un échec. Les affaires en cours ont leur propre colonne.
 */
const PerformanceTable: React.FC<PerformanceTableProps> = ({ rows, resolveLabel, emptyLabel }) => {
  if (rows.length === 0) return <p className="pilotage-empty">{emptyLabel}</p>

  return (
    <table className="pilotage-table">
      <thead>
        <tr>
          <th>Origine</th>
          <th>Leads</th>
          <th>En cours</th>
          <th>Gagnés</th>
          <th>Perdus</th>
          <th>Taux (conclues)</th>
          <th>CA gagné</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{resolveLabel ? resolveLabel(row.key) : displayKey(row.key)}</td>
            <td>{row.total}</td>
            <td className="is-muted">{row.active}</td>
            <td>{row.won}</td>
            <td>{row.lost}</td>
            <td className="is-strong">{formatPercent(row.winRate)}</td>
            <td>{row.wonBudget > 0 ? formatEuro(row.wonBudget) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default PerformanceTable
