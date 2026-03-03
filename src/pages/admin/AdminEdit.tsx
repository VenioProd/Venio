import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { getPermissionsForRole, PERMISSIONS } from '../../lib/permissions'
import type { User, AdminRole } from '../../types/auth.types'
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
  const [admin, setAdmin] = useState<User | null>(null)
  const [form, setForm] = useState<{ name: string; role: string; password: string }>({ name: '', role: 'ADMIN', password: '' })
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const roleDefaults = useMemo(() => getPermissionsForRole(form.role), [form.role])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{ user: User }>(`/api/admin/admins/${userId}`)
        const u = data.user
        setAdmin(u)
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
      setForm((prev) => ({ ...prev, password: '' }))
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour admin')
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
          <span style={{ color: '#ffffff' }}>{admin?.name || 'Administrateur'}</span>
        </div>
        <div className="admin-header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>{admin?.name || 'Administrateur'}</h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0 }}>
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
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
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
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
              Rôle
            </label>
            <select
              className="portal-input"
              value={form.role}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, role: event.target.value })}
            >
              {admin?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super admin</option>}
              <option value="ADMIN">Contributeur</option>
              <option value="VIEWER">Lecture seule</option>
            </select>
          </div>
          {isSuperAdmin && form.role !== 'SUPER_ADMIN' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
                <input type="checkbox" checked={customMode} onChange={handleToggleCustom} />
                Personnaliser les droits
              </label>
              {customMode ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'rgba(255, 255, 255, 0.5)', marginBottom: 8 }}>
                    Droits personnalisés
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {allPermissions.map((perm) => (
                      <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>
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
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'rgba(255, 255, 255, 0.5)' }}>
                    Droits par défaut du rôle
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: 'rgba(255, 255, 255, 0.75)', fontSize: 13 }}>
                    {roleDefaults.map((perm) => (
                      <li key={perm}>{permissionLabels[perm] || perm}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
              Nouveau mot de passe (optionnel)
            </label>
            <input
              className="portal-input"
              type="password"
              placeholder="Laisser vide pour ne pas changer"
              value={form.password}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
            />
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
    </div>
  )
}

export default AdminEdit
