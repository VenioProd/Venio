import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMessaging } from '../context/MessagingContext'
import { NAVIGATION } from '../lib/rbac'
import { getVisibleNavigationZones } from '../lib/adminNavigation'
import { trackAdminEvent } from '../lib/adminAnalytics'
import {
  LayoutDashboard,
  BarChart3,
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
  Building2,
  ShieldCheck,
  Bot,
  ClipboardCheck,
  GraduationCap,
  HelpCircle,
  LogOut,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import UserAvatar from './UserAvatar'
import { apiFetch } from '../lib/api'
import { useModalA11y } from '../hooks/useModalA11y'
import './AdminSidebar.css'

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

const ICONS: Record<(typeof NAVIGATION)[number]['id'], LucideIcon> = {
  home: LayoutDashboard,
  dashboard: BarChart3,
  messages: MessageSquare,
  clients: Users,
  crm: Target,
  projects: FolderKanban,
  accounting: Receipt,
  interns: UserCheck,
  calendar: Calendar,
  emails: Mail,
  templates: FileText,
  resources: BookOpen,
  'tool-access': KeyRound,
  reports: BarChart2,
  analytics: TrendingUp,
  qualiopi: BadgeCheck,
  tickets: LifeBuoy,
  audit: Shield,
  'internal-projects': FolderGit2,
  dev: GitBranch,
  education: GraduationCap,
  subsidiaries: Building2,
  arrow: Crosshair,
  'admin-accounts': ShieldCheck,
  agents: Bot,
  decisions: ClipboardCheck,
  guide: HelpCircle,
}

function getVisibleSections(user: ReturnType<typeof useAuth>['user']): NavSection[] {
  return getVisibleNavigationZones(user).map((zone) => ({
    label: zone.id,
    items: zone.items.map((item) => ({
      to: item.screen,
      label: item.label,
      icon: ICONS[item.id],
      end: item.id === 'home',
    })),
  }))
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

  const unreadTotal = useMemo(() => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0), [conversations])

  const [pendingDecisionsCount, setPendingDecisionsCount] = useState(0)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)

  useModalA11y(drawerOpen, drawerRef, drawerCloseRef)

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

  // Escape ferme le drawer; le focus trap et l'inertie sont assurés par useModalA11y.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDrawerClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, onDrawerClose])

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login')
  }

  const visibleSections = getVisibleSections(user)

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
                onClick={() =>
                  trackAdminEvent(
                    'admin_navigation_selected',
                    item.to.replace('/admin/', '').replace('/admin', 'home').replace(/-/g, '_'),
                  )
                }
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
        <button
          type="button"
          className="admin-sb-brand"
          onClick={() => navigate('/admin')}
          aria-label="Accueil Venio Admin"
        >
          <span className="admin-sb-logo">V</span>
          <span className="admin-sb-brand-name">Venio Admin</span>
        </button>

        <nav className="admin-sb-scroll" aria-label="Navigation principale">
          {navSections}
        </nav>

        <div className="admin-sb-user">
          <UserAvatar
            name={user?.name || user?.email || '?'}
            avatarUrl={user?.avatarUrl}
            className="admin-sb-avatar"
            size={28}
          />
          <div className="admin-sb-user-info">
            <div className="admin-sb-user-name">{user?.name || user?.email || 'Utilisateur'}</div>
            <div className="admin-sb-user-role">{user?.jobTitle || user?.role}</div>
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
          <button type="button" className="admin-sb-footer-btn danger" title="Se déconnecter" onClick={handleLogout}>
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
            <aside
              ref={drawerRef}
              className="admin-sb-drawer"
              aria-label="Navigation mobile"
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
            >
              <div className="admin-sb-drawer-header">
                <button
                  type="button"
                  className="admin-sb-brand"
                  style={{ border: 'none', padding: 0 }}
                  onClick={() => {
                    onDrawerClose?.()
                    navigate('/admin')
                  }}
                  aria-label="Accueil Venio Admin"
                >
                  <span className="admin-sb-logo">V</span>
                  <span className="admin-sb-brand-name">Venio Admin</span>
                </button>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  className="admin-sb-drawer-close"
                  onClick={onDrawerClose}
                  aria-label="Fermer le menu de navigation"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="admin-sb-drawer-body" aria-label="Navigation mobile">
                {navSections}
              </nav>
              <div className="admin-sb-drawer-footer">
                <div className="admin-sb-user">
                  <UserAvatar
                    name={user?.name || user?.email || '?'}
                    avatarUrl={user?.avatarUrl}
                    className="admin-sb-avatar"
                    size={28}
                  />
                  <div className="admin-sb-user-info">
                    <div className="admin-sb-user-name">{user?.name || user?.email || 'Utilisateur'}</div>
                    <div className="admin-sb-user-role">{user?.jobTitle || user?.role}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-sb-footer-btn"
                  onClick={() => {
                    onDrawerClose?.()
                    navigate('/admin/profil')
                  }}
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
          document.body,
        )}
    </>
  )
}

export default AdminSidebar
