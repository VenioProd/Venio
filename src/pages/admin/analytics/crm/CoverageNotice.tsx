import React from 'react'
import type { PilotageResponse } from '../../../../types/pilotage.types'

interface CoverageNoticeProps {
  coverage: PilotageResponse['coverage']
}

/**
 * Ce que le tableau de bord ne sait pas. Un lead déjà avancé dont aucune
 * transition n'a été journalisée reste compté dans l'entonnoir, à son statut
 * courant, mais ne peut alimenter aucune durée. Le taire donnerait une
 * précision que les chiffres n'ont pas.
 */
const CoverageNotice: React.FC<CoverageNoticeProps> = ({ coverage }) => {
  if (coverage.withoutHistory === 0) return null

  return (
    <p className="pilotage-coverage">
      {coverage.withoutHistory} lead{coverage.withoutHistory > 1 ? 's' : ''} sur {coverage.total}{' '}
      {coverage.withoutHistory > 1 ? 'ont' : 'a'} progressé sans que leur parcours soit journalisé. Ils comptent dans
      l'entonnoir à leur étape actuelle, mais pas dans les durées.
    </p>
  )
}

export default CoverageNotice
