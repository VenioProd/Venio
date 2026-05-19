import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import SidebarCollapseToggle from './SidebarCollapseToggle'
import AutoBreadcrumb from './AutoBreadcrumb'
import PushPermissionPrompt from './PushPermissionPrompt'
import { MessagingProvider } from '../context/MessagingContext'
import './AdminShell.css'

const LS_KEY = 'venio-admin-sidebar-collapsed'

const AdminShell = () => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === 'true' } catch { return false }
  })

  const handleCollapseToggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(LS_KEY, String(next)) } catch {}
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        // ignore si dans un input
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
      <div className="admin-shell" data-collapsed={collapsed ? 'true' : 'false'}>
        <AdminSidebar
          collapsed={collapsed}
          drawerOpen={mobileDrawerOpen}
          onDrawerClose={() => setMobileDrawerOpen(false)}
        />
        <SidebarCollapseToggle collapsed={collapsed} onToggle={handleCollapseToggle} />
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
      </div>
    </MessagingProvider>
  )
}

export default AdminShell
