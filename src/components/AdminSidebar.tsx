import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMessaging } from '../context/MessagingContext'
import { hasPermission, PERMISSIONS } from '../lib/permissions'
import {
  LayoutDashboard,
  Users,
  Target,
  FolderKanban,
  Receipt,
  UserCheck,
  MessageSquare,
  Calendar,
  Mail,
  FileText,
  BookOpen,
  KeyRound,
  BarChart2,
  TrendingUp,
  BadgeCheck,
  LifeBuoy,
  Shield,
  FolderGit2,
  GitBranch,
  Crosshair,
  ShieldCheck,
  Bot,
  ClipboardCheck,
  HelpCircle,
  LogOut,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import UserAvatar from './UserAvatar'
import { apiFetch } from '../lib/api'
import './AdminSidebar.css'

const LS_KEY = 'venio-admin-sidebar-collapsed'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  perm?: string
  roles?: ReadonlyArray<string>
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Principal',
    items: [
      { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
      { to: '/admin/messages', label: 'Messages', icon: MessageSquare, perm: PERMISSIONS.VIEW_MESSAGING },
      { to: '/admin/comptes-clients', label: 'Clients', icon: Users, perm: PERMISSIONS.MANAGE_CLIENTS },
      { to: '/admin/crm', label: 'CRM', icon: Target, perm: PERMISSIONS.VIEW_CRM },
      { to: '/admin/gestion', label: 'Projets', icon: FolderKanban, perm: PERMISSIONS.VIEW_PROJECTS },
      { to: '/admin/comptabilite', label: 'Comptabilité', icon: Receipt, perm: PERMISSIONS.VIEW_ACCOUNTING },
      { to: '/admin/stagiaires', label: 'Équipe', icon: UserCheck, roles: ['SUPER_ADMIN', 'RH'] },
    ],
  },
  {
    label: 'Outils',
    items: [
      { to: '/admin/calendrier', label: 'Calendrier', icon: Calendar },
      { to: '/admin/emails', label: 'Emails', icon: Mail, roles: ['SUPER_ADMIN', 'RH'] },
      { to: '/admin/templates', label: 'Templates', icon: FileText },
      { to: '/admin/ressources', label: 'Ressources', icon: BookOpen },
      { to: '/admin/acces-outils', label: 'Accès outils', icon: KeyRound },
      { to: '/admin/mes-rapports', label: 'Mes rapports', icon: BarChart2 },
      { to: '/admin/analytics', label: 'Analytics', icon: TrendingUp, perm: PERMISSIONS.MANAGE_CRM, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Suivi',
    items: [
      { to: '/admin/qualiopi', label: 'Qualiopi', icon: BadgeCheck, roles: ['SUPER_ADMIN', 'RH'] },
      { to: '/admin/tickets', label: 'Tickets', icon: LifeBuoy, roles: ['SUPER_ADMIN'] },
      { to: '/admin/audit', label: 'Audit', icon: Shield, perm: PERMISSIONS.MANAGE_ADMINS, roles: ['SUPER_ADMIN'] },
      { to: '/admin/projets-internes', label: 'Projets internes', icon: FolderGit2 },
      { to: '/admin/dev', label: 'Dev workspace', icon: GitBranch, perm: PERMISSIONS.VIEW_DEV },
    ],
  },
  {
    label: 'Croissance',
    items: [
      { to: '/admin/arrow-prospection', label: 'Arrow prospection', icon: Crosshair, perm: PERMISSIONS.MANAGE_CRM, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/comptes-admin', label: 'Comptes admin', icon: ShieldCheck, perm: PERMISSIONS.MANAGE_ADMINS },
      { to: '/admin/agents', label: 'Agents API', icon: Bot, roles: ['SUPER_ADMIN'] },
      { to: '/admin/decisions', label: 'Décisions', icon: ClipboardCheck, roles: ['SUPER_ADMIN'] },
      { to: '/admin/guide', label: 'Guide', icon: HelpCircle },
    ],
  },
]

function isItemVisible(item: NavItem, user: ReturnType<typeof useAuth>['user']): boolean {
  const permOk = !item.perm || hasPermission(user, item.perm)
  const rolesOk = !item.roles || (user ? item.roles.includes(user.role) : false)
  if (item.perm && item.roles) return permOk || rolesOk
  return permOk && rolesOk
}

export interface AdminSidebarProps {
  collapsed: boolean
  drawerOpen?: boolean
  onDrawerClose?: () => void
}

const AdminSidebar = ({ collapsed, drawerOpen = false, onDrawerClose }: AdminSidebarProps) => {
  const { user, logout } = useAuth()
  const { conversations } = useMessaging()
  const navigate = useNavigate()
  const location = useLocation()

  const unreadTotal = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  )

  const [pendingDecisionsCount, setPendingDecisionsCount] = useState(0)

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      setPendingDecisionsCount(0)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiFetch<{ decisions: any[] }>('/api/admin/decisions?status=PENDING')
        if (!cancelled) setPendingDecisionsCount(res?.decisions?.length ?? 0)
      } catch {
        // silencieux
      }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user?.role])

  // Ferme le drawer mobile à la navigation
  useEffect(() => {
    onDrawerClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Escape ferme le drawer
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDrawerClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, onDrawerClose])

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const visibleSections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => isItemVisible(i, user)) }))
    .filter((s) => s.items.length > 0)

  const navSections = (
    <>
      {visibleSections.map((section) => (
        <div key={section.label} className="admin-sb-section">
          <span className="admin-sb-section-label">{section.label}</span>
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) => `admin-sb-item${isActive ? ' active' : ''}`}
              >
                <Icon size={17} className="admin-sb-icon" aria-hidden />
                <span className="admin-sb-label">{item.label}</span>
                {item.to === '/admin/messages' && unreadTotal > 0 && (
                  <span
                    className="admin-sb-badge"
                    aria-label={`${unreadTotal} message${unreadTotal > 1 ? 's' : ''} non lu${unreadTotal > 1 ? 's' : ''}`}
                  >
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </span>
                )}
                {item.to === '/admin/decisions' && pendingDecisionsCount > 0 && (
                  <span
                    className="admin-sb-badge"
                    aria-label={`${pendingDecisionsCount} décision${pendingDecisionsCount > 1 ? 's' : ''} en attente`}
                  >
                    {pendingDecisionsCount > 99 ? '99+' : pendingDecisionsCount}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
      ))}
    </>
  )

  // ---- Sidebar desktop ----
  return (
    <>
      <aside className={`admin-sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Navigation admin">
        <div
          className="admin-sb-brand"
          onClick={() => navigate('/admin')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
        >
          <span className="admin-sb-logo">V</span>
          <span className="admin-sb-brand-name">Venio Admin</span>
        </div>

        <nav className="admin-sb-scroll" aria-label="Navigation principale">
          {navSections}
        </nav>

        <div className="admin-sb-user">
          <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} className="admin-sb-avatar" size={28} />
          <div className="admin-sb-user-info">
            <div className="admin-sb-user-name">{user?.name || user?.email || 'Utilisateur'}</div>
            <div className="admin-sb-user-role">{user?.role}</div>
          </div>
        </div>

        <div className="admin-sb-footer">
          <button
            type="button"
            className="admin-sb-footer-btn"
            title="Mon profil"
            onClick={() => navigate('/admin/profil')}
          >
            <User size={15} aria-hidden />
            <span className="admin-sb-label">Mon profil</span>
          </button>
          <button
            type="button"
            className="admin-sb-footer-btn danger"
            title="Se déconnecter"
            onClick={handleLogout}
          >
            <LogOut size={15} aria-hidden />
            <span className="admin-sb-label">Déconnexion</span>
          </button>
        </div>

      </aside>

      {/* ---- Drawer mobile (portal) ---- */}
      {drawerOpen &&
        createPortal(
          <>
            <div className="admin-sb-drawer-overlay" onClick={onDrawerClose} aria-hidden />
            <aside className="admin-sb-drawer" aria-label="Navigation mobile">
              <div className="admin-sb-drawer-header">
                <div className="admin-sb-brand" style={{ border: 'none', padding: 0 }}>
                  <span className="admin-sb-logo">V</span>
                  <span className="admin-sb-brand-name">Venio Admin</span>
                </div>
                <button
                  type="button"
                  className="admin-sb-drawer-close"
                  onClick={onDrawerClose}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="admin-sb-drawer-body" aria-label="Navigation mobile">
                {navSections}
              </nav>
              <div className="admin-sb-drawer-footer">
                <div className="admin-sb-user">
                  <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} className="admin-sb-avatar" size={28} />
                  <div className="admin-sb-user-info">
                    <div className="admin-sb-user-name">{user?.name || user?.email || 'Utilisateur'}</div>
                    <div className="admin-sb-user-role">{user?.role}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-sb-footer-btn"
                  onClick={() => { onDrawerClose?.(); navigate('/admin/profil') }}
                >
                  <User size={15} aria-hidden />
                  <span>Mon profil</span>
                </button>
                <button type="button" className="admin-sb-footer-btn danger" onClick={handleLogout}>
                  <LogOut size={15} aria-hidden />
                  <span>Déconnexion</span>
                </button>
              </div>
            </aside>
          </>,
          document.body
        )}
    </>
  )
}

export default AdminSidebar
