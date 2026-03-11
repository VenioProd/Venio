import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { exportToCsv } from '../../lib/exportCsv'
import { useAuth } from '../../context/AuthContext'
import ConfirmModal from '../../components/ConfirmModal'
import type { User } from '../../types/auth.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Contributeur',
  VIEWER: 'Lecture seule',
}

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SUPER_ADMIN: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)', text: '#fde047' },
  ADMIN: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#6ee7b7' },
  VIEWER: { bg: 'rgba(100, 116, 180, 0.12)', border: 'rgba(100, 116, 180, 0.35)', text: '#a5b4cf' },
}

const ROLE_AVATARS: Record<string, string> = {
  SUPER_ADMIN: 'linear-gradient(135deg, rgba(234, 179, 8, 0.3), rgba(202, 138, 4, 0.12))',
  ADMIN: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.1))',
  VIEWER: 'linear-gradient(135deg, rgba(100, 116, 180, 0.25), rgba(100, 116, 180, 0.1))',
}

const AdminList = () => {
  const { user } = useAuth()
  const [admins, setAdmins] = useState<User[]>([])
  const [error, setError] = useState<string>('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [credentialsModal, setCredentialsModal] = useState<{ admin: User; password: string } | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

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

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
    let pwd = ''
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    return pwd
  }

  const handleGetCredentials = async (admin: User) => {
    const newPwd = generatePassword()
    setResetting(admin._id)
    setCopied(false)
    setEmailSent(false)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/admins/${admin._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPwd }),
      })
      setCredentialsModal({ admin, password: newPwd })
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur reinitialisation')
    } finally {
      setResetting(null)
    }
  }

  const handleCopyCredentials = async () => {
    if (!credentialsModal) return
    const text = `Identifiants de connexion Venio\n\nEmail : ${credentialsModal.admin.email}\nMot de passe : ${credentialsModal.password}\n\nConnexion : ${window.location.origin}/admin/login`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSendEmail = async () => {
    if (!credentialsModal) return
    setSending(true)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/admins/${credentialsModal.admin._id}/send-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: credentialsModal.password }),
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setEmailError((err as Error).message || "Erreur lors de l'envoi")
    } finally {
      setSending(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await apiFetch(`/api/admin/admins/${deleteTarget}`, { method: 'DELETE' })
      setAdmins((prev) => prev.filter((admin) => admin._id !== deleteTarget))
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression admin')
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
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </span>
              <span className="portal-action-label">Exporter CSV</span>
            </button>
            <Link className="portal-button portal-action-link" to="/admin/comptes-admin/nouveau" title="Nouvel administrateur">
              <span className="portal-action-icon" aria-hidden>
                <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
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
                    {user?._id === admin._id && (
                      <span className="admin-card-you">Vous</span>
                    )}
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
                      {roleLabels[admin.role] || admin.role}
                    </span>
                  </div>
                  <div className="admin-card-actions" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="admin-card-btn admin-card-btn--edit"
                      type="button"
                      onClick={() => handleGetCredentials(admin)}
                      disabled={resetting === admin._id}
                      style={{ flex: '1 1 100%' }}
                    >
                      {resetting === admin._id ? 'Generation...' : 'Identifiants'}
                    </button>
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

      {credentialsModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
          onClick={() => setCredentialsModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: 16,
              padding: 32, maxWidth: 440, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(14,165,233,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(14,165,233,0.05))',
                border: '1px solid rgba(14,165,233,0.3)', fontSize: 18,
              }}>
                {(credentialsModal.admin.name || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{credentialsModal.admin.name}</h2>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Identifiants de connexion</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Email</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em' }}>{credentialsModal.admin.email}</span>
              </div>
              <div style={{
                background: 'rgba(14,165,233,0.04)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid rgba(14,165,233,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Mot de passe</span>
                <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.05em' }}>{credentialsModal.password}</span>
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 20px', lineHeight: 1.5 }}>
              Un nouveau mot de passe a ete genere. Copiez-le ou envoyez-le par email.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleCopyCredentials}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.2s', letterSpacing: '0.03em',
                }}
              >
                {copied ? 'Copie !' : 'Copier'}
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sending || emailSent}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(14,165,233,0.35)', color: '#38bdf8',
                  fontWeight: 600, fontSize: 13, transition: 'all 0.2s', letterSpacing: '0.03em',
                  opacity: sending || emailSent ? 0.6 : 1,
                }}
              >
                {emailSent ? 'Envoye !' : sending ? 'Envoi...' : 'Envoyer par email'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCredentialsModal(null)}
              style={{
                width: '100%', marginTop: 10, padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                fontWeight: 500, fontSize: 13, transition: 'all 0.2s',
              }}
            >
              Fermer
            </button>

            {emailError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{emailError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminList
