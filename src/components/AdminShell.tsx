import { Outlet } from 'react-router-dom'
import AdminNav from './AdminNav'
import AutoBreadcrumb from './AutoBreadcrumb'
import { MessagingProvider } from '../context/MessagingContext'
import './AdminShell.css'

/**
 * Wrapper appliqué à toutes les pages /admin/* (sauf /admin/login).
 * Fournit la top nav persistante + le breadcrumb + un container fluide
 * sur lequel les pages se posent.
 *
 * MessagingProvider est monté ici (et plus uniquement dans la page Messaging)
 * pour que la nav puisse afficher le badge unread depuis n'importe quelle
 * route admin. Tous les rôles admin (SUPER_ADMIN/ADMIN/RH/VIEWER) ont la
 * permission VIEW_MESSAGING, donc le fetch initial réussit toujours.
 */
const AdminShell = () => {
  return (
    <MessagingProvider>
      <div className="admin-shell">
        <AdminNav />
        <AutoBreadcrumb />
        <main className="admin-shell-main">
          <Outlet />
        </main>
      </div>
    </MessagingProvider>
  )
}

export default AdminShell
