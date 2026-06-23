import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { exportToCsv } from '../../lib/exportCsv'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import ConfirmModal from '../../components/ConfirmModal'
import type { User } from '../../types/auth.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  PDG: 'PDG',
  ADMIN: 'Contributeur',
  RH: 'RH',
  COMMERCIAL: 'Commercial',
  VIEWER: 'Lecture seule',
  STAGIAIRE: 'Stagiaire',
}

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SUPER_ADMIN: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)', text: '#fde047' },
  PDG: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.4)', text: '#fca5a5' },
  ADMIN: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#6ee7b7' },
  RH: { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.35)', text: '#f9a8d4' },
  COMMERCIAL: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.35)', text: '#93c5fd' },
  VIEWER: { bg: 'rgba(100, 116, 180, 0.12)', border: 'rgba(100, 116, 180, 0.35)', text: '#a5b4cf' },
  STAGIAIRE: { bg: 'rgba(251, 146, 60, 0.12)', border: 'rgba(251, 146, 60, 0.35)', text: '#fdba74' },
}

const ROLE_AVATARS: Record<string, string> = {
  SUPER_ADMIN: 'linear-gradient(135deg, rgba(234, 179, 8, 0.3), rgba(202, 138, 4, 0.12))',
  PDG: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(185, 28, 28, 0.12))',
  ADMIN: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.1))',
  RH: 'linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(219, 39, 119, 0.1))',
  COMMERCIAL: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(37, 99, 235, 0.1))',
  VIEWER: 'linear-gradient(135deg, rgba(100, 116, 180, 0.25), rgba(100, 116, 180, 0.1))',
  STAGIAIRE: 'linear-gradient(135deg, rgba(251, 146, 60, 0.25), rgba(234, 88, 12, 0.1))',
}

const AdminList = () => {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [admins, setAdmins] = useState<User[]>([])
  const [error, setError] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [resendingCredentials, setResendingCredentials] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{ users?: User[] }>('/api/admin/admins')
        setAdmins(data.users || [])
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement admins')
      }
    }
    load()
  }, [])

  const handleDelete = (adminId: string) => {
    setDeleteTarget(adminId)
  }

  const handleImpersonate = async (adminId: string) => {
    setImpersonating(adminId)
    try {
      const data = await apiFetch<{ token: string; user: { role: string } }>(
        `/api/admin/admins/impersonate/${adminId}`,
        {
          method: 'POST',
        },
      )
      const targetPath = data.user.role === 'CLIENT' ? '/espace-client' : '/admin'
      const url = `${window.location.origin}${targetPath}?impersonate=${data.token}`
      // Use a temporary <a> link to avoid popup blockers
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur', 'error')
    } finally {
      setImpersonating(null)
    }
  }

  const handleResetLink = async (adminId: string) => {
    setResetting(adminId)
    try {
      const data = await apiFetch<{ resetUrl: string; emailSent: boolean }>(`/api/admin/admins/${adminId}/reset-link`, {
        method: 'POST',
      })
      await navigator.clipboard.writeText(data.resetUrl)
      showToast(
        data.emailSent
          ? 'Email envoye + lien copie dans le presse-papiers'
          : 'Lien copie (email non envoye, verifier SMTP)',
        'success',
      )
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur', 'error')
    } finally {
      setResetting(null)
    }
  }

  const handleResendCredentials = async (adminId: string) => {
    setResendingCredentials(adminId)
    try {
      await apiFetch(`/api/admin/admins/${adminId}/resend-credentials`, { method: 'POST' })
      showToast('Nouveaux identifiants envoyes par email', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur', 'error')
    } finally {
      setResendingCredentials(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await apiFetch(`/api/admin/admins/${deleteTarget}`, { method: 'DELETE' })
      setAdmins((prev) => prev.filter((admin) => admin._id !== deleteTarget))
      showToast('Administrateur supprime', 'success')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression admin')
      showToast('Erreur lors de la suppression', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Comptes admin</span>
        </div>
        <div className="admin-header">
          <h1>Comptes admin</h1>
          <div className="admin-actions portal-actions-reveal">
            <button
              className="portal-button secondary portal-action-link"
              type="button"
              title="Exporter CSV"
              onClick={() => {
                const headers = ['Nom', 'Email', 'Role']
                const rows = admins.map((admin) => [
                  admin.name || '',
                  admin.email || '',
                  roleLabels[admin.role] || admin.role || '',
                ])
                exportToCsv('admins.csv', headers, rows)
              }}
            >
              <span className="portal-action-icon" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              <span className="portal-action-label">Exporter CSV</span>
            </button>
            <Link
              className="portal-button portal-action-link"
              to="/admin/comptes-admin/nouveau"
              title="Nouvel administrateur"
            >
              <span className="portal-action-icon" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              </span>
              <span className="portal-action-label">Nouvel administrateur</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {admins.length === 0 ? (
          <div className="portal-card">
            <div className="admin-empty-state">
              <div className="admin-empty-state-icon">🛡️</div>
              <p className="admin-empty-state-text">Aucun compte admin</p>
            </div>
          </div>
        ) : (
          <div className="admin-cards-grid">
            {admins.map((admin) => {
              const colors = ROLE_COLORS[admin.role] || ROLE_COLORS.VIEWER
              return (
                <div key={admin._id} className="admin-member-card">
                  <div className="client-card-header">
                    <div
                      className="client-card-avatar"
                      style={{ background: ROLE_AVATARS[admin.role] || ROLE_AVATARS.VIEWER }}
                    >
                      {(admin.name || '?').charAt(0).toUpperCase()}
                    </div>
                    {user?._id === admin._id && <span className="admin-card-you">Vous</span>}
                  </div>
                  <h3 className="client-card-name">{admin.name}</h3>
                  <p className="client-card-email">{admin.email}</p>
                  <div className="client-card-tags">
                    <span
                      className="admin-card-role"
                      style={{
                        background: colors.bg,
                        borderColor: colors.border,
                        color: colors.text,
                      }}
                    >
                      {admin.title || roleLabels[admin.role] || admin.role}
                    </span>
                    {admin.tags?.includes('STAGIAIRE') && (
                      <span
                        className="admin-card-role"
                        style={{
                          background: 'rgba(204, 255, 0, 0.12)',
                          borderColor: 'rgba(204, 255, 0, 0.4)',
                          color: 'var(--primary)',
                        }}
                      >
                        Stagiaire
                      </span>
                    )}
                  </div>
                  <div className="admin-card-actions" style={{ flexWrap: 'wrap' }}>
                    {user?.role === 'SUPER_ADMIN' && user?._id !== admin._id && (
                      <>
                        <button
                          className="admin-card-btn admin-card-btn--edit"
                          type="button"
                          onClick={() => handleImpersonate(admin._id)}
                          disabled={impersonating === admin._id}
                          style={{ flex: '1 1 100%' }}
                        >
                          {impersonating === admin._id ? 'Connexion...' : 'Se connecter en tant que'}
                        </button>
                        <button
                          className="admin-card-btn admin-card-btn--edit"
                          type="button"
                          onClick={() => handleResetLink(admin._id)}
                          disabled={resetting === admin._id}
                          style={{ flex: '1 1 100%' }}
                        >
                          {resetting === admin._id ? 'Envoi...' : 'Envoyer lien reinitialisation'}
                        </button>
                        <button
                          className="admin-card-btn admin-card-btn--edit"
                          type="button"
                          onClick={() => handleResendCredentials(admin._id)}
                          disabled={resendingCredentials === admin._id}
                          style={{ flex: '1 1 100%' }}
                        >
                          {resendingCredentials === admin._id ? 'Envoi...' : 'Renvoyer les identifiants'}
                        </button>
                      </>
                    )}
                    <Link className="admin-card-btn admin-card-btn--edit" to={`/admin/comptes-admin/${admin._id}`}>
                      Modifier
                    </Link>
                    <button
                      className="admin-card-btn admin-card-btn--delete"
                      type="button"
                      onClick={() => handleDelete(admin._id)}
                      disabled={user?._id === admin._id}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Supprimer un administrateur"
        message="Supprimer cet administrateur ? Cette action est irr\u00e9versible."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default AdminList
