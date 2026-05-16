import React from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import '../AdminPortal.css'
import '../../espace-client/ClientPortal.css'
import './AccountingPortal.css'

const NAV_ITEMS = [
  { to: '/admin/comptabilite', label: 'Tableau de bord', end: true, perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/ecritures', label: 'Écritures', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/grand-livre', label: 'Grand livre', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/balance', label: 'Balance', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/bilan', label: 'Bilan', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/resultat', label: 'Compte de résultat', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/lettrage', label: 'Lettrage', perm: PERMISSIONS.MANAGE_ACCOUNTING },
  { to: '/admin/comptabilite/tva', label: 'TVA', perm: PERMISSIONS.VIEW_VAT },
  { to: '/admin/comptabilite/fec', label: 'FEC', perm: PERMISSIONS.EXPORT_FEC },
  { to: '/admin/comptabilite/plan-comptable', label: 'Plan comptable', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/journaux', label: 'Journaux', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/file-attente', label: 'File d’attente', perm: PERMISSIONS.MANAGE_ACCOUNTING },
  { to: '/admin/comptabilite/sources-externes', label: 'Sources externes', perm: PERMISSIONS.MANAGE_EXTERNAL_SOURCES },
  { to: '/admin/comptabilite/audit', label: 'Audit', perm: PERMISSIONS.VIEW_ACCOUNTING },
  { to: '/admin/comptabilite/parametres', label: 'Paramètres', perm: PERMISSIONS.MANAGE_ACCOUNTING },
]

export default function AccountingLayout({ title, subtitle, actions, children }) {
  const { user } = useAuth()

  return (
    <div className="portal-container">
      <div className="accounting-shell">
        <div className="accounting-header">
          <div>
            <Link to="/admin" className="accounting-back-link">
              ← Retour au tableau de bord
            </Link>
            <h1>{title || 'Comptabilité'}</h1>
            {subtitle && <div className="subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="accounting-toolbar-right">{actions}</div>}
        </div>

        <nav className="accounting-subnav" aria-label="Navigation comptabilité">
          {NAV_ITEMS.filter((item) => !item.perm || hasPermission(user, item.perm)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `accounting-subnav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {children}
      </div>
    </div>
  )
}
