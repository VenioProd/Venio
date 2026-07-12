import { useState, useEffect, useMemo, useCallback } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { FileText, Menu, LayoutDashboard, MessageSquare, FolderKanban, Search, Target } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import AdminCommandPalette from './AdminCommandPalette'
import SidebarCollapseToggle from './SidebarCollapseToggle'
import AutoBreadcrumb from './AutoBreadcrumb'
import PushPermissionPrompt from './PushPermissionPrompt'
import { useAuth } from '../context/AuthContext'
import { MessagingProvider, useMessaging } from '../context/MessagingContext'
import { trackAdminEvent } from '../lib/adminAnalytics'
import { getMobileNavigation } from '../lib/adminNavigation'
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
  const unreadTotal = useMemo(() => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0), [conversations])
  const mobileItems = useMemo(() => getMobileNavigation(user), [user])

  const mobileIcon = (id: string) => {
    if (id === 'home') return <LayoutDashboard size={22} aria-hidden />
    if (id === 'messages') {
      return (
        <span className="admin-mobile-tab-icon">
          <MessageSquare size={22} aria-hidden />
          {unreadTotal > 0 && (
            <span className="admin-mobile-badge" aria-label={`${unreadTotal} non lus`}>
              {unreadTotal > 9 ? '9+' : unreadTotal}
            </span>
          )}
        </span>
      )
    }
    if (id === 'projects') return <FolderKanban size={22} aria-hidden />
    if (id === 'crm') return <Target size={22} aria-hidden />
    return <FileText size={22} aria-hidden />
  }

  return (
    <div className="admin-shell" data-collapsed={collapsed ? 'true' : 'false'}>
      <AdminSidebar
        collapsed={collapsed}
        drawerOpen={mobileDrawerOpen}
        onDrawerClose={() => setMobileDrawerOpen(false)}
      />
      <SidebarCollapseToggle collapsed={collapsed} onToggle={onCollapseToggle} />
      <div className="admin-shell-body">
        <div className="admin-shell-topbar">
          <button
            type="button"
            className="admin-shell-burger"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Ouvrir le menu de navigation"
            aria-haspopup="dialog"
            aria-expanded={mobileDrawerOpen}
          >
            <Menu size={20} />
          </button>
          <AutoBreadcrumb />
          <button
            type="button"
            className="admin-shell-palette-trigger"
            onClick={onPaletteOpen}
            aria-label="Recherche rapide"
          >
            <Search size={16} aria-hidden />
            <span>Recherche</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <main className="admin-shell-main">
          <PushPermissionPrompt variant="admin" />
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar mobile admin */}
      <nav className="admin-mobile-nav" aria-label="Navigation mobile">
        {mobileItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.screen}
            end={item.id === 'home'}
            className={({ isActive }) => `admin-mobile-tab${isActive ? ' active' : ''}`}
            onClick={() => trackAdminEvent('admin_navigation_selected', item.id.replace(/-/g, '_'))}
          >
            {mobileIcon(item.id)}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`admin-mobile-tab${mobileDrawerOpen ? ' active' : ''}`}
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Ouvrir la navigation complète"
          aria-haspopup="dialog"
          aria-expanded={mobileDrawerOpen}
        >
          <Menu size={22} aria-hidden />
          <span>Menu</span>
        </button>
      </nav>
      {paletteOpen && <AdminCommandPalette onClose={onPaletteClose} />}
    </div>
  )
}

const AdminShell = () => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'true'
    } catch {
      return false
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
  )
}

export default AdminShell
