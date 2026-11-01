import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Film, ListChecks, Menu, MessageSquare, Monitor, Shield, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import type { MessageKey } from '../i18n'
import { isAdminRole } from '../lib/permissions'
import ThemeToggle from './ThemeToggle'
import LanguageSwitch from './LanguageSwitch'
import './Navbar.css'

const NotificationBell = lazy(() => import('./admin/NotificationBell'))
const TicketFab = lazy(() => import('./admin/TicketFab'))

const PUBLIC_LINKS = [
  { to: '/conseil-communication', label: 'nav.consulting', icon: MessageSquare },
  { to: '/services/sites', label: 'nav.services', icon: Monitor },
  { to: '/realisations', label: 'nav.realisations', icon: Film },
  { to: '/methode', label: 'nav.method', icon: ListChecks },
  { to: '/contact', label: 'nav.contact', icon: MessageSquare },
] as const satisfies readonly { to: string; label: MessageKey; icon: typeof Monitor }[]

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuId = useId()
  const gradientId = useId()
  const drawerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  const location = useLocation()
  const { user } = useAuth()
  const { t } = useI18n()
  const reducedMotion = usePrefersReducedMotion()
  const showNotifBell = user && isAdminRole(user.role)
  const showTicketFab =
    user && isAdminRole(user.role) && user.role !== 'SUPER_ADMIN' && location.pathname.startsWith('/admin')
  const isActive = (to: string) =>
    to === '/services/sites' ? location.pathname.startsWith('/services') : location.pathname === to
  const closeMobileMenu = () => setMobileMenuOpen(false)
  const toggleMobileMenu = () => setMobileMenuOpen((open) => !open)

  useEffect(() => {
    let scrollRange = 0
    const onScroll = () => {
      setScrolled(window.scrollY > 24)
      if (progressRef.current) {
        const progress = reducedMotion ? 1 : scrollRange > 0 ? window.scrollY / scrollRange : 0
        progressRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`
      }
    }
    // La hauteur est recalculée au redimensionnement, jamais dans une boucle d'animation.
    const measure = () => {
      scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      onScroll()
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(document.body)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
    }
  }, [reducedMotion, location.pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
      if (event.key !== 'Tab') return
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const onResize = () => {
      if (window.innerWidth > 1100) setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      previousFocus?.focus()
    }
  }, [mobileMenuOpen])

  return (
    <>
      <header className={`sy-navbar${scrolled || mobileMenuOpen ? ' is-solid' : ''}`}>
        <div className="sy-wrap sy-nav-in">
          <Link to="/" className="sy-nav-brand" onClick={closeMobileMenu}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#c4b5fd" />
                  <stop offset=".45" stopColor="#7dd3fc" />
                  <stop offset="1" stopColor="#5eead4" />
                </linearGradient>
              </defs>
              <path d="M3 4.5h4.2L12 15.2 16.8 4.5H21L13.6 20h-3.2z" fill={`url(#${gradientId})`} />
            </svg>
            {/* Nom de marque existant ; aucune clé publique dédiée dans les dictionnaires. */}
            Venio
          </Link>
          <nav className="sy-nav-links" aria-label={t('pubHome.footer.navigation')}>
            {PUBLIC_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className="sy-nav-link" aria-current={isActive(to) ? 'page' : undefined}>
                {t(label)}
              </Link>
            ))}
          </nav>
          <div className="sy-nav-actions">
            <Link to="/contact" className="sy-btn sy-btn--primary sy-btn--sm sy-nav-cta" onClick={closeMobileMenu}>
              {t('nav.cta')} <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <div className="sy-nav-tools">
              <Link
                to="/espace-client"
                className="sy-nav-tool"
                aria-label={t('nav.clientPortal')}
                title={t('nav.clientPortal')}
              >
                <UserRound size={17} aria-hidden="true" />
              </Link>
              <Link to="/admin" className="sy-nav-tool" aria-label={t('nav.admin')} title={t('nav.administration')}>
                <Shield size={17} aria-hidden="true" />
              </Link>
              {showNotifBell && (
                <Suspense fallback={null}>
                  <NotificationBell />
                </Suspense>
              )}
              {showNotifBell && <ThemeToggle />}
            </div>
            <div className="sy-nav-language">
              <LanguageSwitch />
            </div>
            <button
              type="button"
              className="sy-nav-burger"
              onClick={toggleMobileMenu}
              aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileMenuOpen}
              aria-controls={menuId}
            >
              <Menu size={21} aria-hidden="true" />
            </button>
          </div>
        </div>
        <span className="sy-nav-progress" ref={progressRef} aria-hidden="true" />
      </header>

      {mobileMenuOpen && (
        <>
          <div className="sy-nav-overlay" onClick={closeMobileMenu} aria-hidden="true" />
          <div
            className="sy-nav-drawer"
            id={menuId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
          >
            <div className="sy-nav-drawer-head">
              <span className="sy-mono">{t('nav.menu')}</span>
              <button type="button" className="sy-nav-close" onClick={closeMobileMenu}>
                <X size={18} aria-hidden="true" /> {t('nav.closeMenu')}
              </button>
            </div>
            <nav className="sy-nav-drawer-links" aria-label={t('pubHome.footer.navigation')}>
              {PUBLIC_LINKS.map(({ to, label }) => (
                <Link key={to} to={to} aria-current={isActive(to) ? 'page' : undefined} onClick={closeMobileMenu}>
                  {t(label)} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
              <Link to="/espace-client" onClick={closeMobileMenu}>
                <UserRound size={18} aria-hidden="true" />
                {t('nav.clientPortal')}
              </Link>
              <Link to="/admin" onClick={closeMobileMenu}>
                <Shield size={18} aria-hidden="true" />
                {t('nav.admin')}
              </Link>
            </nav>
            <div className="sy-nav-drawer-tools">
              {showNotifBell && (
                <Suspense fallback={null}>
                  <NotificationBell onNavigate={closeMobileMenu} />
                </Suspense>
              )}
              {showNotifBell && <ThemeToggle />}
              <LanguageSwitch />
            </div>
          </div>
        </>
      )}

      <nav className="sy-nav-bottom" aria-label={t('pubHome.nav.mobileLabel')}>
        {PUBLIC_LINKS.slice(1).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} aria-current={isActive(to) ? 'page' : undefined} onClick={closeMobileMenu}>
            <Icon size={20} aria-hidden="true" />
            <span>{t(label)}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={toggleMobileMenu}
          aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={mobileMenuOpen}
          aria-controls={menuId}
        >
          {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          <span>{t('nav.menu')}</span>
        </button>
      </nav>

      {showTicketFab && (
        <>
          <Suspense fallback={null}>
            <TicketFab />
          </Suspense>
          <Link to="/admin/demandes/equipe" className="ticket-fab-tickets" title={t('pubHome.nav.myRequests')}>
            <MessageSquare size={22} aria-hidden="true" />
          </Link>
        </>
      )}
    </>
  )
}

export default Navbar
