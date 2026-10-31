import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
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
  const { t } = useI18n()
  if (coverage.withoutHistory === 0) return null

  return (
    <p className="pilotage-coverage">
      {t('adminTech.pilotage.coverageNotice', { count: coverage.withoutHistory, total: coverage.total })}
    </p>
  )
}

export default CoverageNotice
