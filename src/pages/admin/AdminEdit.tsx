import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getPermissionsForRole, PERMISSIONS } from '../../lib/permissions'
import type { User, AdminRole } from '../../types/auth.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Contributeur',
  VIEWER: 'Lecture seule',
}

const permissionLabels: Record<string, string> = {
  [PERMISSIONS.MANAGE_ADMINS]: 'Gestion des administrateurs',
  [PERMISSIONS.MANAGE_CLIENTS]: 'Gestion des comptes clients',
  [PERMISSIONS.VIEW_CRM]: 'Lecture du CRM',
  [PERMISSIONS.MANAGE_CRM]: 'Gestion du CRM',
  [PERMISSIONS.VIEW_PROJECTS]: 'Lecture des projets',
  [PERMISSIONS.EDIT_PROJECTS]: 'Modification des projets',
  [PERMISSIONS.VIEW_CONTENT]: 'Lecture du contenu',
  [PERMISSIONS.EDIT_CONTENT]: 'Modification du contenu',
  [PERMISSIONS.VIEW_BILLING]: 'Lecture de la facturation',
  [PERMISSIONS.MANAGE_BILLING]: 'Gestion de la facturation',
  [PERMISSIONS.MANAGE_TASKS]: 'Gestion des tâches',
}

const allPermissions = Object.values(PERMISSIONS)

const AdminEdit = () => {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const [admin, setAdmin] = useState<User | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<{ name: string; role: string; password: string }>({ name: '', role: 'ADMIN', password: '' })
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [storedPassword, setStoredPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const roleDefaults = useMemo(() => getPermissionsForRole(form.role), [form.role])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{ user: User }>(`/api/admin/admins/${userId}`)
        const u = data.user
        setAdmin(u)
        setStoredPassword((u as any).plainPassword || null)
        setForm({ name: u.name || '', role: u.role || 'ADMIN', password: '' })
        // Initialize custom permissions from server
        if (Array.isArray((u as any).customPermissions) && (u as any).customPermissions.length > 0) {
          setCustomMode(true)
          setCustomPermissions((u as any).customPermissions)
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement admin')
      }
    }
    load()
  }, [userId])

  const handleToggleCustom = () => {
    if (!customMode) {
      setCustomPermissions([...roleDefaults])
    }
    setCustomMode(!customMode)
  }

  const handlePermToggle = (perm: string) => {
    setCustomPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const handleCopyCredentials = async () => {
    if (!admin || !storedPassword) return
    const text = `Identifiants de connexion Venio\n\nEmail : ${admin.email}\nMot de passe : ${storedPassword}\n\nConnexion : ${window.location.origin}/admin/login`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSendEmail = async () => {
    if (!storedPassword) return
    setSending(true)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/admins/${userId}/send-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: storedPassword }),
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setEmailError((err as Error).message || "Erreur lors de l'envoi")
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { name: form.name, role: form.role }
      if (form.password) {
        payload.password = form.password
      }
      if (isSuperAdmin && form.role !== 'SUPER_ADMIN') {
        payload.customPermissions = customMode ? customPermissions : null
      }
      const data = await apiFetch<{ user: User }>(`/api/admin/admins/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setAdmin(data.user)
      if (form.password) setStoredPassword(form.password)
      setForm((prev) => ({ ...prev, password: '' }))
      showToast('Modifications enregistrees', 'success')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour admin')
      showToast('Erreur lors de la mise a jour', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!admin && !error) {
    return (
      <div className="portal-container">
        <div className="admin-loading">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <Link to="/admin/comptes-admin">Comptes admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{admin?.name || 'Administrateur'}</span>
        </div>
        <div className="admin-header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>{admin?.name || 'Administrateur'}</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {admin?.email} · {roleLabels[admin?.role || ''] || admin?.role}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Nom complet
            </label>
            <input
              className="portal-input"
              placeholder="Nom complet"
              value={form.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Rôle
            </label>
            <CustomSelect
              className="portal-input"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={[
                ...(admin?.role === 'SUPER_ADMIN' ? [{ value: 'SUPER_ADMIN', label: 'Super admin' }] : []),
                { value: 'ADMIN', label: 'Contributeur' },
                { value: 'RH', label: 'RH' },
                { value: 'VIEWER', label: 'Lecture seule' },
              ]}
            />
          </div>
          {isSuperAdmin && form.role !== 'SUPER_ADMIN' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={customMode} onChange={handleToggleCustom} />
                Personnaliser les droits
              </label>
              {customMode ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Droits personnalisés
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {allPermissions.map((perm) => (
                      <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={customPermissions.includes(perm)}
                          onChange={() => handlePermToggle(perm)}
                        />
                        {permissionLabels[perm] || perm}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Droits par défaut du rôle
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {roleDefaults.map((perm) => (
                      <li key={perm}>{permissionLabels[perm] || perm}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Nouveau mot de passe (optionnel)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Laisser vide pour ne pas changer"
                value={form.password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? 'Mise à jour...' : 'Enregistrer'}
            </button>
            <button className="portal-button secondary" type="button" onClick={() => navigate('/admin/comptes-admin')}>
              Retour
            </button>
          </div>
        </form>
      </div>

      <div className="portal-card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8, color: 'var(--text-primary)' }}>Identifiants de connexion</h2>

        {storedPassword ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Email</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em' }}>{admin?.email}</span>
              </div>
              <div style={{
                background: 'rgba(14,165,233,0.04)', borderRadius: 10, padding: '14px 16px',
                border: '1px solid rgba(14,165,233,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Mot de passe</span>
                <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.05em' }}>{storedPassword}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button" onClick={handleCopyCredentials}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff',
                  fontWeight: 600, fontSize: 13, letterSpacing: '0.03em',
                }}
              >
                {copied ? 'Copie !' : 'Copier'}
              </button>
              <button
                type="button" onClick={handleSendEmail} disabled={sending || emailSent}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(14,165,233,0.35)', color: '#38bdf8',
                  fontWeight: 600, fontSize: 13, letterSpacing: '0.03em',
                  opacity: sending || emailSent ? 0.6 : 1,
                }}
              >
                {emailSent ? 'Envoye !' : sending ? 'Envoi...' : 'Envoyer par email'}
              </button>
            </div>
            {emailError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{emailError}</p>}
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            Le mot de passe n'est pas disponible. Modifiez-le via le champ ci-dessus pour le mettre a jour.
          </p>
        )}
      </div>
    </div>
  )
}

export default AdminEdit
