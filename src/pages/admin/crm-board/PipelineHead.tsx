import type { ReactNode } from 'react'
import { CrmPageHead } from '../../../components/admin/crm-ui'
import { useI18n } from '../../../context/I18nContext'
import { formatEuro } from './rich/columns'

/**
 * En-tête de la page Pipeline : titre, chapô avec les totaux de l'écran (leads ouverts, montant,
 * pondéré) et actions. Sans totaux (chargement), le chapô est omis plutôt qu'inventé.
 */
export default function PipelineHead({
  totals,
  actions,
}: {
  totals?: { count: number; open: number; weighted: number }
  actions?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <CrmPageHead
      title={t('shell.crm.tab.pipeline')}
      lede={
        totals
          ? t('crmSuivre.pipeline.lede', {
              count: totals.count,
              open: formatEuro(totals.open),
              weighted: formatEuro(totals.weighted),
            })
          : undefined
      }
      actions={actions}
    />
  )
}
