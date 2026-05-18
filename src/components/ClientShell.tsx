import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import ClientSidebar from './ClientSidebar'
import PushPermissionPrompt from './PushPermissionPrompt'
import './ClientShell.css'

const ClientShell = () => {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="client-shell">
      <ClientSidebar drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      <div className="client-shell-body">
        <header className="client-shell-topbar">
          <button
            type="button"
            className="client-shell-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu de navigation"
          >
            <Menu size={20} aria-hidden />
          </button>
          <span className="client-shell-kicker">Espace client</span>
        </header>
        <main className="client-shell-main">
          <PushPermissionPrompt variant="client" />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default ClientShell
