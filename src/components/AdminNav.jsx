import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../lib/permissions'
import './AdminNav.css'

/**
 * Top navigation bar persistante de l'espace admin Venio.
 * Affichage horizontal classique, sticky, avec liens directs vers
 * les sections principales et un menu utilisateur à droite.
 */
export default function AdminNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const items = [
    { to: '/admin', label: 'Tableau de bord', end: true },
    { to: '/admin/comptes-clients', label: 'Clients', perm: PERMISSIONS.MANAGE_CLIENTS },
    { to: '/admin/crm', label: 'CRM', perm: PERMISSIONS.VIEW_CRM },
    { to: '/admin/comptabilite', label: 'Comptabilité', perm: PERMISSIONS.VIEW_ACCOUNTING },
    { to: '/admin/comptes-admin', label: 'Admins', perm: PERMISSIONS.MANAGE_ADMINS },
  ]
  const visibleItems = items.filter((i) => !i.perm || hasPermission(user, i.perm))

  function handleLogout() {
    logout()
    navigate('/admin/login')
  }

  return (
    <header className="admin-nav">
      <div className="admin-nav-inner">
        <div
          className="admin-nav-brand"
          onClick={() => navigate('/admin')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
        >
          <span className="admin-nav-logo">V</span>
          <span className="admin-nav-brand-text">Venio Admin</span>
        </div>

        <nav className="admin-nav-links" aria-label="Navigation principale">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-nav-user">
          <button
            className="admin-nav-user-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="admin-nav-avatar">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </span>
            <span className="admin-nav-user-label">{user?.name || user?.email || 'Utilisateur'}</span>
            <span className="admin-nav-caret" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen && (
            <>
              <div className="admin-nav-menu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="admin-nav-menu" role="menu">
                <div className="admin-nav-menu-header">
                  <div className="admin-nav-menu-name">{user?.name || 'Utilisateur'}</div>
                  <div className="admin-nav-menu-email">{user?.email}</div>
                  <div className="admin-nav-menu-role">{user?.role}</div>
                </div>
                <button
                  className="admin-nav-menu-item danger"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  Se déconnecter
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
