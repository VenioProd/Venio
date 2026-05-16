import { Outlet } from 'react-router-dom'
import AdminNav from './AdminNav'
import AutoBreadcrumb from './AutoBreadcrumb'
import './AdminShell.css'

/**
 * Wrapper appliqué à toutes les pages /admin/* (sauf /admin/login).
 * Fournit la top nav persistante + le breadcrumb + un container fluide
 * sur lequel les pages se posent.
 */
const AdminShell = () => {
  return (
    <div className="admin-shell">
      <AdminNav />
      <AutoBreadcrumb />
      <main className="admin-shell-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminShell
