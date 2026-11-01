import { useState, useEffect, useMemo, useCallback } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Menu, Plus, HelpCircle } from 'lucide-react'
import AdminSidebar, { ADMIN_NAV_ICONS } from './AdminSidebar'
import AdminCommandPalette from './AdminCommandPalette'
import AutoBreadcrumb from './AutoBreadcrumb'
import PushPermissionPrompt from './PushPermissionPrompt'
import { useAuth } from '../context/AuthContext'
import { MessagingProvider, useMessaging } from '../context/MessagingContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import {
  getMobileNavigation,
  getNavigationLabel,
  getVisibleAdminNavigation,
  isAdminNavigationActive,
  getCommandPaletteItems,
} from '../lib/adminNavigation'
import { useI18n } from '../context/I18nContext'
import LanguageSelect from './LanguageSelect'
import ThemeToggle from './ThemeToggle'
import UserAvatar from './UserAvatar'
import NotificationBell from './admin/NotificationBell'
import { NotificationProvider } from '../context/NotificationContext'
import './AdminShell.css'

const LS_KEY = 'venio-admin-sidebar-collapsed'

interface AdminShellInnerProps {
  mobileDrawerOpen: boolean
  setMobileDrawerOpen: (v: boolean) => void
  collapsed: boolean
  onCollapseToggle: () => void
  paletteOpen: boolean
  onPaletteOpen: () => void
  onPaletteClose: () => void
}

// Composant interne pour accéder au MessagingContext (qui est fourni par le parent AdminShell)
const AdminShellInner = ({
  mobileDrawerOpen,
  setMobileDrawerOpen,
  collapsed,
  onCollapseToggle,
  paletteOpen,
  onPaletteOpen,
  onPaletteClose,
}: AdminShellInnerProps) => {
  const { conversations } = useMessaging()
  const { user } = useAuth()
  const { t } = useI18n()
  const unreadTotal = useMemo(() => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0), [conversations])
  const mobileItems = getMobileNavigation(user)

  const location = useLocation()
  const currentItem = getVisibleAdminNavigation(user).find((item) => isAdminNavigationActive(item, location.pathname))
  const currentModule = getCommandPaletteItems(user)
    .filter((item) => item.kind === 'module' && location.pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]
  const pageTitle = currentItem
    ? getNavigationLabel(currentItem)
    : location.pathname === '/admin/profil'
      ? t('shell.nav.profile')
      : location.pathname === '/admin/mon-releve'
        ? t('shell.nav.statement')
        : currentModule?.label
  const quickActions = getCommandPaletteItems(user).filter((item) => item.kind === 'action')

  return (
    <div className="admin-shell" data-collapsed={collapsed ? 'true' : 'false'}>
      <a className="admin-shell-skip" href="#admin-main">
        {t('shell.nav.skip')}
      </a>
      <AdminSidebar
        collapsed={collapsed}
        onCollapseToggle={onCollapseToggle}
        onPaletteOpen={onPaletteOpen}
        drawerOpen={mobileDrawerOpen}
        onDrawerClose={() => setMobileDrawerOpen(false)}
      />
      <div className="admin-shell-body">
        <header className="admin-shell-topbar">
          <Link to="/admin/mon-espace" className="admin-shell-mobile-brand" aria-label={t('shell.nav.adminHome')}>
            <span className="admin-sb-logo" aria-hidden>
              V
            </span>
          </Link>
          <div className="admin-shell-breadcrumb">
            <AutoBreadcrumb />
          </div>
          <span className="admin-shell-mobile-title">{pageTitle}</span>
          <div className="admin-shell-top-actions">
            {quickActions.length > 0 && (
              <details
                className="admin-shell-create"
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
                <summary>
                  <Plus size={16} aria-hidden />
                  {t('shell.nav.create')}
                </summary>
                <nav aria-label={t('shell.nav.create')}>
                  {quickActions.map((action) => (
                    <Link
                      key={action.id}
                      to={action.to}
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open')
                        trackAdminEvent('admin_palette_selected', action.id)
                      }}
                    >
                      {action.label}
                    </Link>
                  ))}
                </nav>
              </details>
            )}
            <NotificationBell />
            <Link
              className="admin-shell-help"
              to="/admin/guide"
              aria-label={t('shell.navItem.guide')}
              title={t('shell.navItem.guide')}
            >
              <HelpCircle size={18} aria-hidden />
            </Link>
            <div className="admin-shell-desktop-controls">
              <ThemeToggle />
              <LanguageSelect compact />
            </div>
            <Link className="admin-shell-mobile-avatar" to="/admin/profil" aria-label={t('shell.nav.profile')}>
              <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} size={28} />
            </Link>
          </div>
        </header>
        <main id="admin-main" className="admin-shell-main" tabIndex={-1}>
          <PushPermissionPrompt variant="admin" />
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar mobile admin */}
      <nav className="admin-mobile-nav" aria-label={t('shell.nav.mobileAria')}>
        {mobileItems.map((item) => {
          const Icon = ADMIN_NAV_ICONS[item.id]
          const active = isAdminNavigationActive(item, location.pathname)
          return (
            <Link
              key={item.id}
              to={item.screen}
              aria-current={active ? 'page' : undefined}
              className={`admin-mobile-tab${active ? ' active' : ''}`}
              onClick={() => trackAdminEvent('admin_navigation_selected', item.id)}
            >
              <span className="admin-mobile-tab-icon">
                <Icon size={20} aria-hidden />
                {item.id === 'inbox' && unreadTotal > 0 && (
                  <span className="admin-mobile-badge" aria-label={t('shell.nav.unreadTab', { count: unreadTotal })}>
                    {unreadTotal > 9 ? '9+' : unreadTotal}
                  </span>
                )}
              </span>
              <span>{getNavigationLabel(item)}</span>
            </Link>
          )
        })}
        <button
          type="button"
          className={`admin-mobile-tab${mobileDrawerOpen || (currentItem && !mobileItems.some((item) => item.id === currentItem.id)) ? ' active' : ''}`}
          onClick={() => setMobileDrawerOpen(true)}
          aria-label={t('shell.nav.openFullNav')}
          aria-haspopup="dialog"
          aria-expanded={mobileDrawerOpen}
        >
          <Menu size={22} aria-hidden />
          <span>{t('shell.nav.more')}</span>
        </button>
      </nav>
      {paletteOpen && <AdminCommandPalette onClose={onPaletteClose} />}
    </div>
  )
}

const AdminShell = () => {
  useEffect(() => {
    document.body.classList.add('admin-system-theme')
    return () => document.body.classList.remove('admin-system-theme')
  }, [])
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) !== 'false'
    } catch {
      return true
    }
  })

  const handleCollapseToggle = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(LS_KEY, String(next))
    } catch {}
  }, [collapsed])

  const openPalette = useCallback(() => {
    setMobileDrawerOpen(false)
    setPaletteOpen(true)
    trackAdminEvent('admin_palette_opened', 'search')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        handleCollapseToggle()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCollapseToggle, openPalette])

  return (
    <NotificationProvider>
      <MessagingProvider>
        <AdminShellInner
          mobileDrawerOpen={mobileDrawerOpen}
          setMobileDrawerOpen={setMobileDrawerOpen}
          collapsed={collapsed}
          onCollapseToggle={handleCollapseToggle}
          paletteOpen={paletteOpen}
          onPaletteOpen={openPalette}
          onPaletteClose={() => setPaletteOpen(false)}
        />
      </MessagingProvider>
    </NotificationProvider>
  )
}

export default AdminShell
