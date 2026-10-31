import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import '../espace-client/ClientPortal.css'
import '../admin/AdminPortal.css'
import './CommercialSpace.css'

const TABS = [
  { to: '/commercial', label: 'Mes leads', end: true },
  { to: '/commercial/clients', label: 'Mes clients', end: false },
  { to: '/commercial/commissions', label: 'Mes commissions', end: false },
]

// Une fiche lead reste sous l'onglet « Mes leads ».
const isLeadPath = (pathname: string) => pathname.startsWith('/commercial/leads/')

/** Coque de l'espace commercial externe : trois onglets, rien d'autre de Venio. */
const CommercialSpace = () => {
  const { user, logout } = useAuth()
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
          <span className="commercial-kicker">Espace commercial</span>
          <strong>{user?.name}</strong>
        </div>
        <button type="button" className="portal-button secondary" onClick={handleLogout}>
          Se déconnecter
        </button>
      </header>
      <main className="commercial-main">
        <nav className="admin-tabs commercial-tabs" aria-label="Espace commercial">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => `admin-tab${isActive || (tab.end && isLeadPath(pathname)) ? ' active' : ''}`}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </main>
    </div>
  )
}

export default CommercialSpace
