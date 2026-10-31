import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Menu, FolderKanban, BookOpen, User, HelpCircle } from 'lucide-react'
import ClientSidebar from './ClientSidebar'
import PushPermissionPrompt from './PushPermissionPrompt'
import LanguageSelect from './LanguageSelect'
import { useI18n } from '../context/I18nContext'
import './ClientShell.css'

const ClientShell = () => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { t } = useI18n()

  return (
    <div className="client-shell">
      <ClientSidebar drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      <div className="client-shell-body">
        <header className="client-shell-topbar">
          <button
            type="button"
            className="client-shell-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('shell.nav.openMenu')}
          >
            <Menu size={20} aria-hidden />
          </button>
          <span className="client-shell-kicker">{t('nav.clientPortal')}</span>
          <LanguageSelect compact />
        </header>
        <main className="client-shell-main">
          <PushPermissionPrompt variant="client" />
          <Outlet />
        </main>
      </div>

      {/* Bottom tab bar mobile espace client */}
      <nav className="client-mobile-nav" aria-label={t('shell.client.mobileNavAria')}>
        <NavLink to="/espace-client" end className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}>
          <FolderKanban size={22} aria-hidden />
          <span>{t('shell.client.tabProjects')}</span>
        </NavLink>
        <NavLink
          to="/espace-client/guide"
          className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}
        >
          <BookOpen size={22} aria-hidden />
          <span>{t('shell.client.guide')}</span>
        </NavLink>
        <NavLink
          to="/espace-client/profil"
          className={({ isActive }) => `client-mobile-tab${isActive ? ' active' : ''}`}
        >
          <User size={22} aria-hidden />
          <span>{t('shell.client.profile')}</span>
        </NavLink>
        <button
          type="button"
          className={`client-mobile-tab${drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(true)}
          aria-label={t('shell.nav.openFullNav')}
        >
          <HelpCircle size={22} aria-hidden />
          <span>{t('shell.client.tabSupport')}</span>
        </button>
      </nav>
    </div>
  )
}

export default ClientShell
