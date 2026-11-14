import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { CRM_MOMENTS, CRM_PLAN, crmTabsOf, type CrmTab } from '../../../lib/crmNavigation'
import { CrmPageHead } from '../../../components/admin/crm-ui'

/**
 * « Où est quoi ? » : où se trouve chaque ancien onglet du CRM dans les quatre
 * moments. Version simple du lot 0, que le lot 4 (Piloter) complète.
 * N'affiche que les écrans auxquels l'utilisateur a accès.
 */
export default function CrmPlan({ visibleTabs }: { visibleTabs: readonly CrmTab[] }) {
  const { t } = useI18n()
  const momentLabel = (id: string) => t(CRM_MOMENTS.find((moment) => moment.id === id)!.labelKey)
  const rows = CRM_PLAN.map((row) => ({
    ...row,
    targets: visibleTabs.filter((tab) => (row.tabs as readonly string[]).includes(tab.id)),
  })).filter((row) => row.targets.length > 0)
  const moments = CRM_MOMENTS.map((moment) => ({ ...moment, first: crmTabsOf(moment.id, visibleTabs)[0] })).filter(
    (moment) => moment.first,
  )

  return (
    <div className="crm-plan">
      <CrmPageHead title={t('crmPlan.title')} lede={t('crmPlan.lede')} />
      <ul className="crm-ui-plan-moments" aria-label={t('shell.crm.momentsAria')}>
        {moments.map((moment) => (
          <li key={moment.id}>
            <Link className="crm-ui-card" to={moment.first!.to}>
              <strong className="crm-ui-section-head__title">{t(moment.labelKey)}</strong>
              <p>{t(`crmPlan.moment.${moment.id}`)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <section className="crm-ui-card crm-ui-card--flush" aria-labelledby="crm-plan-table">
        <h2 className="crm-ui-sr-only" id="crm-plan-table">
          {t('crmPlan.tableTitle')}
        </h2>
        <table className="crm-ui-plan-table">
          <thead>
            <tr>
              <th scope="col">{t('crmPlan.col.before')}</th>
              <th scope="col">{t('crmPlan.col.now')}</th>
              <th scope="col">{t('crmPlan.col.moment')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="crm-ui-plan-table__old">{t(row.oldLabelKey)}</span>
                  <span className="crm-ui-plan-table__path">{row.oldPath}</span>
                </td>
                <td>
                  {row.targets.map((tab) => (
                    <Link key={tab.id} to={tab.to}>
                      {t(tab.labelKey)}
                      <ChevronRight size={14} aria-hidden="true" />
                    </Link>
                  ))}
                </td>
                <td>{momentLabel(row.targets[0].moment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
