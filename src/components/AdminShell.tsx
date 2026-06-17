import { useState, useEffect, useMemo } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Menu, LayoutDashboard, MessageSquare, FolderKanban, Target } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import SidebarCollapseToggle from './SidebarCollapseToggle'
import AutoBreadcrumb from './AutoBreadcrumb'
import PushPermissionPrompt from './PushPermissionPrompt'
import { MessagingProvider, useMessaging } from '../context/MessagingContext'
import './AdminShell.css'

const LS_KEY = 'venio-admin-sidebar-collapsed'

interface AdminShellInnerProps {
  mobileDrawerOpen: boolean
  setMobileDrawerOpen: (v: boolean) => void
  collapsed: boolean
  onCollapseToggle: () => void
}

// Composant interne pour accéder au MessagingContext (qui est fourni par le parent AdminShell)
const AdminShellInner = ({
  mobileDrawerOpen,
  setMobileDrawerOpen,
  collapsed,
  onCollapseToggle,
}: AdminShellInnerProps) => {
  const { conversations } = useMessaging()
  const unreadTotal = useMemo(() => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0), [conversations])

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
          >
            <Menu size={20} />
          </button>
          <AutoBreadcrumb />
        </div>
        <main className="admin-shell-main">
          <PushPermissionPrompt variant="admin" />
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar mobile admin */}
      <nav className="admin-mobile-nav" aria-label="Navigation mobile">
        <NavLink to="/admin" end className={({ isActive }) => `admin-mobile-tab${isActive ? ' active' : ''}`}>
          <LayoutDashboard size={22} aria-hidden />
          <span>Accueil</span>
        </NavLink>
        <NavLink to="/admin/messages" className={({ isActive }) => `admin-mobile-tab${isActive ? ' active' : ''}`}>
          <span className="admin-mobile-tab-icon">
            <MessageSquare size={22} aria-hidden />
            {unreadTotal > 0 && (
              <span className="admin-mobile-badge" aria-label={`${unreadTotal} non lus`}>
                {unreadTotal > 9 ? '9+' : unreadTotal}
              </span>
            )}
          </span>
          <span>Messages</span>
        </NavLink>
        <NavLink to="/admin/gestion" className={({ isActive }) => `admin-mobile-tab${isActive ? ' active' : ''}`}>
          <FolderKanban size={22} aria-hidden />
          <span>Projets</span>
        </NavLink>
        <NavLink to="/admin/crm" className={({ isActive }) => `admin-mobile-tab${isActive ? ' active' : ''}`}>
          <Target size={22} aria-hidden />
          <span>CRM</span>
        </NavLink>
        <button
          type="button"
          className={`admin-mobile-tab${mobileDrawerOpen ? ' active' : ''}`}
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Ouvrir la navigation complète"
        >
          <Menu size={22} aria-hidden />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}

const AdminShell = () => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'true'
    } catch {
      return false
    }
  })

  const handleCollapseToggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(LS_KEY, String(next))
    } catch {}
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        handleCollapseToggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed])

  return (
    <MessagingProvider>
      <AdminShellInner
        mobileDrawerOpen={mobileDrawerOpen}
        setMobileDrawerOpen={setMobileDrawerOpen}
        collapsed={collapsed}
        onCollapseToggle={handleCollapseToggle}
      />
    </MessagingProvider>
  )
}

export default AdminShell
