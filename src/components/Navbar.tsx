import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { isAdminRole } from '../lib/permissions'
import NotificationBell from './admin/NotificationBell'
import TicketFab from './admin/TicketFab'
import ThemeToggle from './ThemeToggle'
import LanguageSwitch from './LanguageSwitch'
import './Navbar.css'

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useI18n()
  const showNotifBell = user && isAdminRole(user.role)
  const showTicketFab = user && isAdminRole(user.role) && user.role !== 'SUPER_ADMIN' && location.pathname.startsWith('/admin')

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
    if (!mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
    document.body.style.overflow = 'unset'
  }

  return (<>
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="logo" onClick={closeMobileMenu}>VENIO</Link>
        <div className="nav-links">
          <Link 
            to="/services/communication" 
            className={`nav-link nav-link-icon ${location.pathname.startsWith('/services') ? 'active' : ''}`}
            data-tooltip={t('nav.services')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span className="nav-link-text">{t('nav.services')}</span>
          </Link>
          
          <Link 
            to="/realisations" 
            className={`nav-link nav-link-icon ${location.pathname === '/realisations' ? 'active' : ''}`}
            data-tooltip={t('nav.realisations')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="2" y="2" width="20" height="20" rx="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="2" y1="7" x2="7" y2="7" />
              <line x1="2" y1="17" x2="7" y2="17" />
              <line x1="17" y1="17" x2="22" y2="17" />
              <line x1="17" y1="7" x2="22" y2="7" />
            </svg>
            <span className="nav-link-text">{t('nav.realisations')}</span>
          </Link>
          
          <Link 
            to="/a-propos" 
            className={`nav-link nav-link-icon ${location.pathname === '/a-propos' ? 'active' : ''}`}
            data-tooltip={t('nav.about')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="nav-link-text">{t('nav.about')}</span>
          </Link>
          
          <Link 
            to="/contact" 
            className={`nav-link nav-link-icon ${location.pathname === '/contact' ? 'active' : ''}`}
            data-tooltip={t('nav.contact')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="nav-link-text">{t('nav.contact')}</span>
          </Link>
          
          <div className="nav-separator"></div>
          
          <Link 
            to="/espace-client" 
            className={`nav-link nav-portal nav-link-icon ${location.pathname.startsWith('/espace-client') ? 'active' : ''}`}
            data-tooltip={t('nav.clientPortal')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="nav-link-text">{t('nav.clientPortal')}</span>
          </Link>
          
          <Link 
            to="/admin" 
            className={`nav-link nav-portal nav-link-icon ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
            data-tooltip={t('nav.administration')}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="nav-link-text">{t('nav.admin')}</span>
          </Link>

          {showNotifBell && <NotificationBell />}
          {showNotifBell && <ThemeToggle />}
          <LanguageSwitch />
        </div>
        
        <button 
          type="button"
          className={`burger-menu ${mobileMenuOpen ? 'active' : ''}`}
          onClick={toggleMobileMenu}
          aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={mobileMenuOpen}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-header">
          <span className="mobile-menu-title">{t('nav.menu')}</span>
          <button
            type="button"
            className="mobile-menu-close"
            onClick={closeMobileMenu}
            aria-label={t('nav.closeMenu')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span>{t('nav.closeMenu')}</span>
          </button>
        </div>
        <div className="mobile-menu-content">
          <Link to="/services/communication" className="mobile-nav-link" onClick={closeMobileMenu}>
            {t('nav.services')}
          </Link>
          <Link to="/realisations" className="mobile-nav-link" onClick={closeMobileMenu}>
            {t('nav.realisations')}
          </Link>
          <Link to="/a-propos" className="mobile-nav-link" onClick={closeMobileMenu}>
            {t('nav.about')}
          </Link>
          <Link to="/contact" className="mobile-nav-link" onClick={closeMobileMenu}>
            {t('nav.contact')}
          </Link>
          <Link to="/espace-client" className="mobile-nav-link mobile-nav-portal" onClick={closeMobileMenu}>
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {t('nav.clientPortal')}
          </Link>
          <Link to="/admin" className="mobile-nav-link mobile-nav-portal" onClick={closeMobileMenu}>
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {t('nav.admin')}
          </Link>
          <div className="mobile-menu-bottom">
            {showNotifBell && <NotificationBell onNavigate={closeMobileMenu} />}
            {showNotifBell && <ThemeToggle />}
            <LanguageSwitch />
          </div>
        </div>
      </div>
    </nav>
    {showTicketFab && (
      <>
        <TicketFab />
        <Link to="/admin/tickets" className="ticket-fab-tickets" title="Mes demandes">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </Link>
      </>
    )}
  </>
  )
}

export default Navbar
