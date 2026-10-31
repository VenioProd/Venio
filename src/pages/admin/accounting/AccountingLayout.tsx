import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import '../AdminPortal.css'
import '../../espace-client/ClientPortal.css'
import './AccountingPortal.css'

interface NavItem {
  to: string
  labelKey: MessageKey
  end?: boolean
  perm?: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin/comptabilite', labelKey: 'accAccounts.nav.dashboard', end: true, perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/projets', labelKey: 'accAccounts.nav.projects', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/stripe', labelKey: 'accAccounts.nav.stripe', perm: PERMISSIONS.VIEW_ACCOUNTING },
  {
    to: '/admin/comptabilite/beneficiaires',
    labelKey: 'accAccounts.nav.beneficiaries',
    perm: PERMISSIONS.VIEW_ACCOUNTING,
  },
  {
    to: '/admin/comptabilite/modeles-repartition',
    labelKey: 'accAccounts.nav.allocationModels',
    perm: PERMISSIONS.VIEW_ACCOUNTING,
  },
  { to: '/admin/comptabilite/ecritures', labelKey: 'accAccounts.nav.entries', perm: PERMISSIONS.VIEW_ACCOUNTING },
  {
    to: '/admin/comptabilite/grand-livre',
    labelKey: 'accAccounts.nav.generalLedger',
    perm: PERMISSIONS.VIEW_ACCOUNTING,
  },
  { to: '/admin/comptabilite/balance', labelKey: 'accAccounts.nav.trialBalance', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/bilan', labelKey: 'accAccounts.nav.balanceSheet', perm: PERMISSIONS.VIEW_ACCOUNTING },
  {
    to: '/admin/comptabilite/resultat',
    labelKey: 'accAccounts.nav.incomeStatement',
    perm: PERMISSIONS.VIEW_ACCOUNTING,
  },
  {
    to: '/admin/comptabilite/lettrage',
    labelKey: 'accAccounts.nav.reconciliation',
    perm: PERMISSIONS.MANAGE_ACCOUNTING,
  },
  { to: '/admin/comptabilite/tva', labelKey: 'accAccounts.nav.vat', perm: PERMISSIONS.VIEW_VAT },
  { to: '/admin/comptabilite/fec', labelKey: 'accAccounts.nav.fec', perm: PERMISSIONS.EXPORT_FEC },
  {
    to: '/admin/comptabilite/plan-comptable',
    labelKey: 'accAccounts.nav.chartOfAccounts',
    perm: PERMISSIONS.VIEW_ACCOUNTING,
  },
  { to: '/admin/comptabilite/journaux', labelKey: 'accAccounts.nav.journals', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/file-attente', labelKey: 'accAccounts.nav.queue', perm: PERMISSIONS.MANAGE_ACCOUNTING },
  {
    to: '/admin/comptabilite/sources-externes',
    labelKey: 'accAccounts.nav.externalSources',
    perm: PERMISSIONS.MANAGE_EXTERNAL_SOURCES,
  },
  { to: '/admin/comptabilite/audit', labelKey: 'accAccounts.nav.audit', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/parametres', labelKey: 'accAccounts.nav.settings', perm: PERMISSIONS.MANAGE_ACCOUNTING },
]

interface AccountingLayoutProps {
  title?: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

const AccountingLayout = ({ title, subtitle, actions, children }: AccountingLayoutProps) => {
  const { user } = useAuth()
  const { t } = useI18n()

  return (
    <div className="accounting-shell">
      <div className="admin-page-header">
        <div>
          <h1 style={{ margin: 0 }}>{title || t('accAccounts.layout.title')}</h1>
          {subtitle && <p className="admin-page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="accounting-toolbar-right">{actions}</div>}
      </div>

      <nav className="accounting-subnav" aria-label={t('accAccounts.layout.navLabel')}>
        {NAV_ITEMS.filter((item) => !item.perm || hasPermission(user, item.perm)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `accounting-subnav-link${isActive ? ' active' : ''}`}
          >
            {t(item.labelKey)}
          </NavLink>
        ))}
      </nav>

      {children}
    </div>
  )
}

export default AccountingLayout
