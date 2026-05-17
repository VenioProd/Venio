import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../lib/permissions'
import './AdminNav.css'

/**
 * Définition d'un lien :
 * - `perm` : permission requise via hasPermission(user, perm)
 * - `roles` : si défini, l'utilisateur doit avoir l'un de ces rôles
 *   Si les deux sont fournis, il faut satisfaire AU MOINS l'un des deux.
 */
interface NavItem {
  to: string
  label: string
  end?: boolean
  perm?: string
  roles?: ReadonlyArray<string>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Tableau de bord', end: true },
  { to: '/admin/messages', label: 'Messages', perm: PERMISSIONS.VIEW_MESSAGING },
  { to: '/admin/comptes-clients', label: 'Clients', perm: PERMISSIONS.MANAGE_CLIENTS },
  { to: '/admin/crm', label: 'CRM', perm: PERMISSIONS.VIEW_CRM },
  { to: '/admin/gestion', label: 'Projets', perm: PERMISSIONS.VIEW_PROJECTS },
  { to: '/admin/comptabilite', label: 'Comptabilité', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/stagiaires', label: 'Équipe', roles: ['SUPER_ADMIN', 'RH'] },
]

const MORE_GROUPS: NavGroup[] = [
  {
    label: 'Outils',
    items: [
      { to: '/admin/calendrier', label: 'Calendrier' },
      { to: '/admin/emails', label: 'Emails', roles: ['SUPER_ADMIN', 'RH'] },
      { to: '/admin/templates', label: 'Templates' },
      { to: '/admin/ressources', label: 'Ressources' },
      { to: '/admin/acces-outils', label: 'Accès outils' },
      { to: '/admin/mes-rapports', label: 'Mes rapports' },
      { to: '/admin/analytics', label: 'Analytics', perm: PERMISSIONS.MANAGE_CRM, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Suivi',
    items: [
      { to: '/admin/qualiopi', label: 'Qualiopi', roles: ['SUPER_ADMIN', 'RH'] },
      { to: '/admin/tickets', label: 'Tickets', roles: ['SUPER_ADMIN'] },
      { to: '/admin/audit', label: 'Audit', perm: PERMISSIONS.MANAGE_ADMINS, roles: ['SUPER_ADMIN'] },
      { to: '/admin/projets-internes', label: 'Projets internes' },
    ],
  },
  {
    label: 'Croissance',
    items: [
      { to: '/admin/arrow-prospection', label: 'Arrow prospection', perm: PERMISSIONS.MANAGE_CRM, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/comptes-admin', label: 'Comptes admin', perm: PERMISSIONS.MANAGE_ADMINS },
      { to: '/admin/guide', label: 'Guide' },
    ],
  },
]

function isItemVisible(item: NavItem, user: ReturnType<typeof useAuth>['user']): boolean {
  const permOk = !item.perm || hasPermission(user, item.perm)
  const rolesOk = !item.roles || (user ? item.roles.includes(user.role) : false)
  if (item.perm && item.roles) return permOk || rolesOk
  return permOk && rolesOk
}

/**
 * Top navigation bar persistante de l'espace admin Venio.
 * Les pop-overs (mega-menu, user menu, drawer mobile) sont rendus via
 * React Portal dans document.body pour s'extraire de tout stacking
 * context parent et garantir qu'ils s'affichent toujours au-dessus
 * de tout le reste de l'UI.
 */
const AdminNav = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [userOpen, setUserOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  const userBtnRef = useRef<HTMLButtonElement | null>(null)

  // Ferme les menus à la navigation
  useEffect(() => {
    setUserOpen(false)
    setMoreOpen(false)
    setDrawerOpen(false)
  }, [location.pathname])

  // Escape ferme tout
  useEffect(() => {
    if (!moreOpen && !userOpen && !drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        setUserOpen(false)
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen, userOpen, drawerOpen])

  const visibleMain = MAIN_ITEMS.filter((i) => isItemVisible(i, user))
  const visibleGroups: NavGroup[] = MORE_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => isItemVisible(i, user)) }))
    .filter((g) => g.items.length > 0)

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()

  // ---- Pop-overs rendus en portail (hors stacking context) ----

  const moreMenuPortal = moreOpen
    ? createPortal(
        <>
          <div
            className="admin-nav-portal-overlay"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="admin-nav-megamenu admin-nav-megamenu--portal" role="menu">
            {visibleGroups.map((g) => (
              <div key={g.label} className="admin-nav-megamenu-col">
                <div className="admin-nav-megamenu-title">{g.label}</div>
                <ul className="admin-nav-megamenu-list">
                  {g.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `admin-nav-megamenu-item${isActive ? ' active' : ''}`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>,
        document.body
      )
    : null

  const userMenuPortal = userOpen
    ? createPortal(
        <>
          <div
            className="admin-nav-portal-overlay"
            onClick={() => setUserOpen(false)}
            aria-hidden
          />
          <div className="admin-nav-menu admin-nav-menu--portal" role="menu">
            <div className="admin-nav-menu-header">
              <div className="admin-nav-menu-name">{user?.name || 'Utilisateur'}</div>
              <div className="admin-nav-menu-email">{user?.email}</div>
              <div className="admin-nav-menu-role">{user?.role}</div>
            </div>
            <button
              type="button"
              className="admin-nav-menu-item"
              onClick={() => {
                setUserOpen(false)
                navigate('/admin/profil')
              }}
              role="menuitem"
            >
              Mon profil
            </button>
            <button
              type="button"
              className="admin-nav-menu-item danger"
              onClick={handleLogout}
              role="menuitem"
            >
              Se déconnecter
            </button>
          </div>
        </>,
        document.body
      )
    : null

  const drawerPortal = drawerOpen
    ? createPortal(
        <>
          <div
            className="admin-nav-drawer-overlay"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="admin-nav-drawer" aria-label="Navigation mobile">
            <div className="admin-nav-drawer-header">
              <span className="admin-nav-drawer-title">Navigation</span>
              <button
                type="button"
                className="admin-nav-drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="admin-nav-drawer-body">
              <div className="admin-nav-drawer-section">
                <div className="admin-nav-drawer-section-title">Principal</div>
                <ul className="admin-nav-drawer-list">
                  {visibleMain.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `admin-nav-drawer-item${isActive ? ' active' : ''}`
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
              {visibleGroups.map((g) => (
                <div key={g.label} className="admin-nav-drawer-section">
                  <div className="admin-nav-drawer-section-title">{g.label}</div>
                  <ul className="admin-nav-drawer-list">
                    {g.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            `admin-nav-drawer-item${isActive ? ' active' : ''}`
                          }
                        >
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </aside>
        </>,
        document.body
      )
    : null

  return (
    <>
      <header className="admin-nav">
        <div className="admin-nav-inner">
          <div
            className="admin-nav-brand"
            onClick={() => navigate('/admin')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
          >
            <span className="admin-nav-logo">V</span>
            <span className="admin-nav-brand-text">Venio Admin</span>
          </div>

          <nav className="admin-nav-links" aria-label="Navigation principale">
            {visibleMain.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}

            {visibleGroups.length > 0 && (
              <button
                ref={moreBtnRef}
                type="button"
                className={`admin-nav-link admin-nav-more-btn${moreOpen ? ' is-open' : ''}`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                Plus <span className="admin-nav-caret" aria-hidden>▾</span>
              </button>
            )}
          </nav>

          <button
            type="button"
            className="admin-nav-burger"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Ouvrir le menu de navigation"
            aria-expanded={drawerOpen}
          >
            <span aria-hidden>☰</span>
          </button>

          <div className="admin-nav-user">
            <button
              ref={userBtnRef}
              type="button"
              className="admin-nav-user-btn"
              onClick={() => setUserOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userOpen}
            >
              <span className="admin-nav-avatar">{initial}</span>
              <span className="admin-nav-user-label">
                {user?.name || user?.email || 'Utilisateur'}
              </span>
              <span className="admin-nav-caret" aria-hidden>▾</span>
            </button>
          </div>
        </div>
      </header>

      {moreMenuPortal}
      {userMenuPortal}
      {drawerPortal}
    </>
  )
}

export default AdminNav
