import React from 'react'
import { Outlet } from 'react-router-dom'
import AdminNav from './AdminNav'
import Breadcrumb from './Breadcrumb'
import './AdminShell.css'

/**
 * Wrapper appliqué à toutes les pages /admin/* (sauf /admin/login).
 * Fournit la top nav persistante + le breadcrumb + un container fluide
 * sur lequel les pages se posent.
 */
export default function AdminShell() {
  return (
    <div className="admin-shell">
      <AdminNav />
      <Breadcrumb />
      <main className="admin-shell-main">
        <Outlet />
      </main>
    </div>
  )
}
