import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { PerformanceRow } from '../../../../types/pilotage.types'
import { displayKey, formatEuro, formatPercent } from './constants'

interface PerformanceTableProps {
  rows: (PerformanceRow & { ownerName?: string | null })[]
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
  const { t } = useI18n()
  if (rows.length === 0) return <p className="pilotage-empty">{emptyLabel}</p>

  return (
    <div className="pilotage-table-scroll">
      <table className="pilotage-table">
        <thead>
          <tr>
            <th>{t(resolveLabel ? 'crmRich.analytics.owner' : 'adminTech.pilotage.colOrigin')}</th>
            <th>{t('adminTech.pilotage.colLeads')}</th>
            <th>{t('adminTech.pilotage.colActive')}</th>
            <th>{t('adminTech.pilotage.colWon')}</th>
            <th>{t('adminTech.pilotage.colLost')}</th>
            <th>{t('adminTech.pilotage.colWinRate')}</th>
            <th>{t('adminTech.pilotage.declaredBudget')}</th>
            <th>{t('adminTech.pilotage.signed')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{resolveLabel ? row.ownerName?.trim() || resolveLabel(row.key) : displayKey(row.key)}</td>
              <td>{row.total}</td>
              <td className="is-muted">{row.active}</td>
              <td>{row.won}</td>
              <td>{row.lost}</td>
              <td className="is-strong">{formatPercent(row.winRate)}</td>
              <td className="is-muted">{row.wonBudget > 0 ? formatEuro(row.wonBudget) : '—'}</td>
              <td className="is-strong">{row.wonSigned > 0 ? formatEuro(row.wonSigned) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PerformanceTable
