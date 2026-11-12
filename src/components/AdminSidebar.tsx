import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMessaging } from '../context/MessagingContext'
import {
  getVisibleNavigationZones,
  getAdminNavigationLabel,
  getZoneLabel,
  isAdminNavigationActive,
  type AdminNavigationId,
} from '../lib/adminNavigation'
import { useI18n } from '../context/I18nContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import {
  LayoutDashboard,
  TrendingUp,
  Target,
  FolderKanban,
  Receipt,
  Users,
  Calendar,
  BookOpen,
  GitBranch,
  GraduationCap,
  Inbox,
  ShieldCheck,
  MessageSquare,
  LogOut,
  Search,
  ChevronDown,
  PanelLeftOpen,
  Building2,
  X,
  type LucideIcon,
} from 'lucide-react'
import UserAvatar from './UserAvatar'
import SidebarCollapseToggle from './SidebarCollapseToggle'
import { apiFetch } from '../lib/api'
import { hasPermission } from '../lib/permissions'
import { ADMIN_MODULE_PATHS } from '../lib/adminHubRoutes'
import { useModalA11y } from '../hooks/useModalA11y'
import './AdminSidebar.css'

export const ADMIN_NAV_ICONS: Record<AdminNavigationId, LucideIcon> = {
  home: LayoutDashboard,
  inbox: MessageSquare,
  analytics: TrendingUp,
  crm: Target,
  projects: FolderKanban,
  requests: Inbox,
  calendar: Calendar,
  dev: GitBranch,
  resources: BookOpen,
  accounting: Receipt,
  team: Users,
  training: GraduationCap,
  system: ShieldCheck,
}

export interface AdminSidebarProps {
  collapsed: boolean
  onCollapseToggle?: () => void
  onPaletteOpen?: () => void
  drawerOpen?: boolean
  onDrawerClose?: () => void
}

const AdminSidebar = ({
  collapsed,
  onCollapseToggle,
  onPaletteOpen,
  drawerOpen = false,
  onDrawerClose,
}: AdminSidebarProps) => {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const { conversations } = useMessaging()
  const navigate = useNavigate()
  const location = useLocation()
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 1024)
  useEffect(() => {
    const resize = () => setDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tapOpen, setTapOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const pinned = desktop && !collapsed
  const expanded = pinned || hovered || focused || tapOpen
  const unreadTotal = useMemo(() => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0), [conversations])
  const [pendingDecisionsCount, setPendingDecisionsCount] = useState(0)
  const [changeRequestsToQualify, setChangeRequestsToQualify] = useState(0)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)
  const previousPath = useRef(location.pathname)
  useModalA11y(drawerOpen, drawerRef, drawerCloseRef)

  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname
      onDrawerClose?.()
      setTapOpen(false)
      setWorkspaceOpen(false)
    }
  }, [location.pathname, onDrawerClose])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDrawerClose?.()
    }
    const onResize = () => {
      if (window.innerWidth >= 768) onDrawerClose?.()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [drawerOpen, onDrawerClose])

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') return
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiFetch<{ decisions: unknown[] }>('/api/admin/decisions?status=PENDING')
        if (!cancelled) setPendingDecisionsCount(res?.decisions?.length ?? 0)
      } catch {
        /* Badge non bloquant. */
      }
    }
    void load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user?.role])

  useEffect(() => {
    if (!hasPermission(user, 'view_change_requests')) return
    let cancelled = false
    const load = async () => {
      try {
        const stats = await apiFetch<{ aTraiter: number }>('/api/admin/change-requests/stats')
        if (!cancelled) setChangeRequestsToQualify(stats?.aTraiter ?? 0)
      } catch {
        /* Badge non bloquant. */
      }
    }
    void load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  const navSections = getVisibleNavigationZones(user).map((zone) => (
    <section key={zone.id} className="admin-sb-section" aria-label={getZoneLabel(zone.id)}>
      <h2 className="admin-sb-section-label">{getZoneLabel(zone.id)}</h2>
      {zone.items.map((item) => {
        const Icon = ADMIN_NAV_ICONS[item.id]
        const active = isAdminNavigationActive(item, location.pathname)
        const count =
          item.id === 'inbox'
            ? unreadTotal
            : item.id === 'home' && user?.role === 'SUPER_ADMIN'
              ? pendingDecisionsCount
              : item.id === 'requests' && hasPermission(user, 'view_change_requests')
                ? changeRequestsToQualify
                : 0
        const badgeLabel =
          item.id === 'inbox'
            ? 'shell.nav.unreadMessages'
            : item.id === 'home'
              ? 'shell.nav.pendingDecisions'
              : 'shell.nav.requestsToQualify'
        return (
          <Link
            key={item.id}
            to={item.screen}
            title={getAdminNavigationLabel(item)}
            aria-current={active ? 'page' : undefined}
            className={`admin-sb-item${active ? ' active' : ''}`}
            onClick={() => {
              trackAdminEvent('admin_navigation_selected', item.id)
              onDrawerClose?.()
            }}
          >
            <Icon size={16} className="admin-sb-icon" aria-hidden />
            <span className="admin-sb-label">{getAdminNavigationLabel(item)}</span>
            {count > 0 && (
              <span className="admin-sb-badge" aria-label={t(badgeLabel, { count })}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        )
      })}
    </section>
  ))

  const brand = (
    <button
      type="button"
      className="admin-sb-brand"
      onClick={() => navigate('/admin/mon-espace')}
      aria-label={t('shell.nav.adminHome')}
    >
      <span className="admin-sb-logo" aria-hidden>
        V
      </span>
      <span className="admin-sb-label">Venio</span>
    </button>
  )
  const userCard = (
    <Link className="admin-sb-user" to="/admin/profil" aria-label={t('shell.nav.profile')} onClick={onDrawerClose}>
      <UserAvatar
        name={user?.name || user?.email || '?'}
        avatarUrl={user?.avatarUrl}
        size={32}
        className="admin-sb-avatar"
      />
      <span className="admin-sb-user-info">
        <span className="admin-sb-user-name">{user?.name || user?.email || t('shell.nav.userFallback')}</span>
        <span className="admin-sb-user-role">{user?.jobTitle || user?.role}</span>
      </span>
    </Link>
  )
  const search = (
    <button
      type="button"
      className="admin-sb-search"
      aria-label={t('shell.palette.quickSearch')}
      onClick={onPaletteOpen}
    >
      <Search size={16} aria-hidden />
      <span className="admin-sb-label">{t('shell.palette.searchTrigger')}</span>
      <kbd>⌘K</kbd>
    </button>
  )
  const workspace = (surface: string) => (
    <div className="admin-sb-workspace">
      {user?.role === 'SUPER_ADMIN' ? (
        <>
          <button
            type="button"
            className="admin-sb-workspace-trigger"
            aria-label={t('shell.nav.workspace')}
            aria-expanded={workspaceOpen}
            aria-controls={`admin-workspace-options-${surface}`}
            onClick={() => setWorkspaceOpen((open) => !open)}
          >
            <Building2 size={16} aria-hidden />
            <span className="admin-sb-label">{t('shell.nav.workspace')}</span>
            <ChevronDown size={14} className="admin-sb-label" aria-hidden />
          </button>
          {workspaceOpen && (
            <div id={`admin-workspace-options-${surface}`} className="admin-sb-workspace-options">
              <Link to={ADMIN_MODULE_PATHS.subsidiaries} onClick={onDrawerClose}>
                {t('shell.navItem.subsidiaries')}
              </Link>
              <Link to={ADMIN_MODULE_PATHS.dashboard} onClick={onDrawerClose}>
                {t('shell.nav.portfolio')}
              </Link>
            </div>
          )}
        </>
      ) : (
        <div className="admin-sb-workspace-trigger">
          <Building2 size={16} aria-hidden />
          <span className="admin-sb-label">{t('shell.nav.workspace')}</span>
        </div>
      )}
    </div>
  )

  return (
    <>
      <aside
        className="admin-sidebar"
        aria-label={t('shell.nav.adminAria')}
        data-expanded={expanded}
        data-pinned={pinned}
        onMouseEnter={() => {
          clearTimeout(closeTimer.current)
          setHovered(true)
        }}
        onMouseLeave={() => {
          closeTimer.current = setTimeout(() => setHovered(false), 150)
        }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocused(false)
            setTapOpen(false)
            setWorkspaceOpen(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setTapOpen(false)
            setWorkspaceOpen(false)
          }
        }}
      >
        <div className="admin-sb-top">
          <div className="admin-sb-brand-row">
            {brand}
            {onCollapseToggle && (
              <SidebarCollapseToggle expanded={expanded} collapsed={collapsed} onToggle={onCollapseToggle} />
            )}
          </div>
          <button
            type="button"
            className="admin-sb-rail-toggle"
            aria-label={expanded ? t('shell.sidebar.collapse') : t('shell.sidebar.expand')}
            aria-expanded={expanded}
            aria-controls="admin-rail-navigation"
            onClick={(event) => {
              if (tapOpen) {
                setTapOpen(false)
                setHovered(false)
                event.currentTarget.blur()
              } else setTapOpen(true)
            }}
          >
            <PanelLeftOpen size={16} aria-hidden />
          </button>
          {workspace('rail')}
          {search}
        </div>
        <nav id="admin-rail-navigation" className="admin-sb-scroll" aria-label={t('shell.nav.mainAria')}>
          {navSections}
        </nav>
        <div className="admin-sb-bottom">
          <details
            className="admin-sb-profile"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
            }}
          >
            <summary className="admin-sb-user" aria-label={t('shell.nav.accountMenu')}>
              <UserAvatar
                name={user?.name || user?.email || '?'}
                avatarUrl={user?.avatarUrl}
                size={32}
                className="admin-sb-avatar"
              />
              <span className="admin-sb-user-info">
                <span className="admin-sb-user-name">{user?.name || user?.email || t('shell.nav.userFallback')}</span>
                <span className="admin-sb-user-role">{user?.jobTitle || user?.role}</span>
              </span>
            </summary>
            <nav className="admin-sb-profile-options" aria-label={t('shell.nav.accountMenu')}>
              <Link
                to="/admin/profil"
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              >
                {t('shell.nav.profile')}
              </Link>
              <Link
                to="/admin/mon-releve"
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              >
                {t('shell.nav.statement')}
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await logout()
                  navigate('/admin/login')
                }}
              >
                <LogOut size={16} aria-hidden />
                {t('shell.nav.logoutTitle')}
              </button>
            </nav>
          </details>
        </div>
      </aside>
      {drawerOpen &&
        createPortal(
          <aside
            ref={drawerRef}
            className="admin-sb-drawer"
            aria-label={t('shell.nav.mobileAria')}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="admin-sb-drawer-header">
              {brand}
              <span>{t('shell.nav.more')}</span>
              <button
                ref={drawerCloseRef}
                type="button"
                className="admin-sb-drawer-close"
                onClick={onDrawerClose}
                aria-label={t('shell.nav.closeMenu')}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="admin-sb-drawer-tools">
              {workspace('sheet')}
              {search}
            </div>
            <nav className="admin-sb-drawer-body" aria-label={t('shell.nav.mobileAria')}>
              {navSections}
            </nav>
            <div className="admin-sb-drawer-footer">
              {userCard}
              <Link to="/admin/guide" onClick={onDrawerClose}>
                {t('shell.navItem.guide')}
              </Link>
              <Link to="/admin/mon-releve" onClick={onDrawerClose}>
                {t('shell.nav.statement')}
              </Link>
              <button
                type="button"
                className="admin-sb-logout"
                onClick={async () => {
                  await logout()
                  navigate('/admin/login')
                }}
              >
                <LogOut size={16} aria-hidden />
                {t('auth.logout')}
              </button>
            </div>
          </aside>,
          document.body,
        )}
    </>
  )
}
export default AdminSidebar
