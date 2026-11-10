import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n, type MessageKey } from '../../context/I18nContext'
import LanguageSelect from '../../components/LanguageSelect'
import '../espace-client/ClientPortal.css'
import '../admin/AdminPortal.css'
import './CommercialSpace.css'

const TABS: { to: string; labelKey: MessageKey; end: boolean }[] = [
  { to: '/commercial', labelKey: 'commercial.tab.leads', end: true },
  { to: '/commercial/calls', labelKey: 'commercial.calls.title', end: false },
  { to: '/commercial/clients', labelKey: 'commercial.tab.clients', end: false },
  { to: '/commercial/commissions', labelKey: 'commercial.tab.commissions', end: false },
]

// Une fiche lead reste sous l'onglet « Mes leads ».
const isLeadPath = (pathname: string) => pathname.startsWith('/commercial/leads/')

/** Coque de l’espace commercial externe. */
const CommercialSpace = () => {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="commercial-space">
      <header className="commercial-topbar">
        <div className="commercial-topbar-title">
          <span className="commercial-kicker">{t('commercial.shell.kicker')}</span>
          <strong>{user?.name}</strong>
        </div>
        <div className="commercial-topbar-actions">
          <LanguageSelect compact />
          <button type="button" className="portal-button secondary" onClick={handleLogout}>
            {t('commercial.shell.logout')}
          </button>
        </div>
      </header>
      <main className="commercial-main">
        <nav className="admin-tabs commercial-tabs" aria-label={t('commercial.shell.nav')}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => `admin-tab${isActive || (tab.end && isLeadPath(pathname)) ? ' active' : ''}`}
            >
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </main>
    </div>
  )
}

export default CommercialSpace
