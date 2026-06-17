import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Menu, FolderKanban, BookOpen, User, HelpCircle } from 'lucide-react'
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

      {/* Bottom tab bar mobile espace client */}
      <nav className="client-mobile-nav" aria-label="Navigation mobile espace client">
        <NavLink to="/espace-client" end className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}>
          <FolderKanban size={22} aria-hidden />
          <span>Projets</span>
        </NavLink>
        <NavLink
          to="/espace-client/guide"
          className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}
        >
          <BookOpen size={22} aria-hidden />
          <span>Guide</span>
        </NavLink>
        <NavLink
          to="/espace-client/profil"
          className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}
        >
          <User size={22} aria-hidden />
          <span>Profil</span>
        </NavLink>
        <button
          type="button"
          className={`client-mobile-tab${drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-label="Ouvrir la navigation complète"
        >
          <HelpCircle size={22} aria-hidden />
          <span>Support</span>
        </button>
      </nav>
    </div>
  )
}

export default ClientShell
