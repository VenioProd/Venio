import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { CRM_MOMENTS, crmTabsOf, type CrmTab } from '../../../lib/crmNavigation'
import { CrmEmpty, CrmPageHead } from '../../../components/admin/crm-ui'
import { PLAN_ROWS } from './planRows'
import './crmPlan.css'

/**
 * « Où est quoi ? » : pour chaque fonction du CRM d'avant, où elle se trouve
 * maintenant, avec un lien. N'affiche que les écrans auxquels l'utilisateur a
 * accès : un lien dont l'onglet n'est pas permis disparaît, et une ligne sans
 * aucun lien permis aussi.
 */
export default function CrmPlan({ visibleTabs }: { visibleTabs: readonly CrmTab[] }) {
  const { t } = useI18n()
  const allowed = new Map(visibleTabs.map((tab) => [tab.id as string, tab]))
  const momentLabel = (id: string) => t(CRM_MOMENTS.find((moment) => moment.id === id)!.labelKey)
  const rows = PLAN_ROWS.map((row) => ({
    ...row,
    links: row.links.filter((entry) => allowed.has(entry.tab)),
  })).filter((row) => row.links.length > 0)
  const moments = CRM_MOMENTS.map((moment) => ({ ...moment, first: crmTabsOf(moment.id, visibleTabs)[0] })).filter(
    (moment) => moment.first,
  )

  return (
    <div className="crm-plan">
      <CrmPageHead title={t('crmPlan.title')} lede={t('crmPlan.lede')} />
      {moments.length === 0 ? (
        <CrmEmpty title={t('crmPlan.empty')} />
      ) : (
        <>
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
                      <span className="crm-ui-plan-table__old">{t(row.oldKey)}</span>
                      <span className="crm-plan-detail">{t(row.detailKey)}</span>
                    </td>
                    <td>
                      {row.links.map((entry) => (
                        <Link key={entry.labelKey} to={entry.to}>
                          {t(entry.labelKey)}
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>
                      ))}
                    </td>
                    <td>
                      <span className="crm-plan-moment-tag">{momentLabel(allowed.get(row.links[0].tab)!.moment)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="crm-ui-card crm-plan-external" aria-labelledby="crm-plan-external">
            <h2 className="crm-ui-section-head__title" id="crm-plan-external">
              {t('crmPlan.external.title')}
            </h2>
            <p>{t('crmPlan.external.text')}</p>
          </section>
        </>
      )}
    </div>
  )
}
