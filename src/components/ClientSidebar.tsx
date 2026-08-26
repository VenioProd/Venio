import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, FolderKanban, HelpCircle, LogOut, MessageSquarePlus, User, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'
import './ClientSidebar.css'

interface ClientNavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  activePrefixes?: string[]
}

const NAV_ITEMS: ClientNavItem[] = [
  {
    to: '/espace-client',
    label: 'Mes projets',
    icon: FolderKanban,
    end: true,
    activePrefixes: ['/espace-client/projets'],
  },
  {
    to: '/espace-client/demandes',
    label: 'Demandes',
    icon: MessageSquarePlus,
    activePrefixes: ['/espace-client/demandes'],
  },
  { to: '/espace-client/guide', label: 'Guide', icon: BookOpen },
  { to: '/espace-client/profil', label: 'Profil', icon: User },
]

interface ClientSidebarProps {
  drawerOpen?: boolean
  onDrawerClose?: () => void
}

const ClientSidebar = ({ drawerOpen = false, onDrawerClose }: ClientSidebarProps) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    onDrawerClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDrawerClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, onDrawerClose])

  const handleLogout = async () => {
    await logout()
    navigate('/espace-client/login')
  }

  const nav = (
    <>
      <div className="client-sb-section">
        <span className="client-sb-section-label">Navigation</span>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              end={item.end}
              className={({ isActive }) => {
                const prefixActive = item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix))
                return `client-sb-item${isActive || prefixActive ? ' active' : ''}`
              }}
            >
              <Icon size={18} className="client-sb-icon" aria-hidden />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
      <div className="client-sb-section">
        <span className="client-sb-section-label">Support</span>
        <a className="client-sb-item" href="mailto:contact@venio.fr">
          <HelpCircle size={18} className="client-sb-icon" aria-hidden />
          <span>Contacter Venio</span>
        </a>
      </div>
    </>
  )

  const footer = (
    <>
      <div className="client-sb-user">
        <UserAvatar
          name={user?.name || user?.email || '?'}
          avatarUrl={user?.avatarUrl}
          className="client-sb-avatar"
          size={32}
        />
        <div className="client-sb-user-info">
          <div className="client-sb-user-name">{user?.name || user?.email || 'Client'}</div>
          {user?.companyName && <div className="client-sb-user-role">{user.companyName}</div>}
        </div>
      </div>
      <button type="button" className="client-sb-logout" onClick={handleLogout}>
        <LogOut size={16} aria-hidden />
        <span>Déconnexion</span>
      </button>
    </>
  )

  return (
    <>
      <aside className="client-sidebar" aria-label="Navigation espace client">
        <button type="button" className="client-sb-brand" onClick={() => navigate('/espace-client')}>
          <span className="client-sb-logo">V</span>
          <span className="client-sb-brand-name">Venio</span>
        </button>
        <nav className="client-sb-nav" aria-label="Navigation principale">
          {nav}
        </nav>
        <div className="client-sb-footer">{footer}</div>
      </aside>

      {drawerOpen &&
        createPortal(
          <>
            <div className="client-sb-drawer-overlay" onClick={onDrawerClose} aria-hidden />
            <aside className="client-sb-drawer" aria-label="Navigation mobile espace client">
              <div className="client-sb-drawer-header">
                <button type="button" className="client-sb-brand" onClick={() => navigate('/espace-client')}>
                  <span className="client-sb-logo">V</span>
                  <span className="client-sb-brand-name">Venio</span>
                </button>
                <button type="button" className="client-sb-drawer-close" onClick={onDrawerClose} aria-label="Fermer">
                  <X size={18} aria-hidden />
                </button>
              </div>
              <nav className="client-sb-drawer-body" aria-label="Navigation mobile">
                {nav}
              </nav>
              <div className="client-sb-drawer-footer">{footer}</div>
            </aside>
          </>,
          document.body,
        )}
    </>
  )
}

export default ClientSidebar
