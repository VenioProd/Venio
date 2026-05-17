import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import AutoBreadcrumb from './AutoBreadcrumb'
import { MessagingProvider } from '../context/MessagingContext'
import './AdminShell.css'

const AdminShell = () => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  return (
    <MessagingProvider>
      <div className="admin-shell">
        <AdminSidebar
          drawerOpen={mobileDrawerOpen}
          onDrawerClose={() => setMobileDrawerOpen(false)}
        />
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
            <Outlet />
          </main>
        </div>
      </div>
    </MessagingProvider>
  )
}

export default AdminShell
