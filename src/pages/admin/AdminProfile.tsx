import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch, getToken } from '../../lib/api'
import NotificationSettings from '../../components/NotificationSettings'
import NotificationPreferencesPanel from '../../components/NotificationPreferencesPanel'
import { ColorThemePicker } from '../../components/ColorThemePicker'
import ThemeToggle from '../../components/ThemeToggle'
import UserAvatar from '../../components/UserAvatar'
import AvatarCropModal from '../../components/AvatarCropModal'
import '../espace-client/ClientPortal.css'

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: '#a78bfa' },
  ADMIN: { label: 'Commercial', color: '#0ea5e9' },
  VIEWER: { label: 'Lecteur', color: '#64748b' },
}

const AdminProfile = () => {
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    companyName: user?.companyName || '',
    website: user?.website || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [cropFile, setCropFile] = useState<File | null>(null)

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      await refreshUser()
      setSuccess('Profil mis a jour avec succes')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur lors de la mise a jour')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Le mot de passe doit contenir au moins 6 caracteres')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas')
      return
    }
    setSavingPassword(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPasswords({ current: false, new: false, confirm: false })
      setSuccess('Mot de passe modifie avec succes')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setPasswordError((err as Error).message || 'Erreur lors du changement de mot de passe')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setAvatarError('Format non supporté. Utilisez JPEG, PNG ou WebP.')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("L'image dépasse 2 Mo.")
      e.target.value = ''
      return
    }
    setCropFile(file)
    e.target.value = ''
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null)
    setAvatarUploading(true)
    setAvatarError('')
    try {
      const formData = new FormData()
      formData.append('avatar', blob, 'avatar.jpg')
      const token = getToken()
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erreur lors de l'upload")
      }
      await refreshUser()
      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || "Erreur lors de l'upload")
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleCropCancel = () => setCropFile(null)

  const handleAvatarDelete = async () => {
    setAvatarError('')
    setAvatarUploading(true)
    try {
      await apiFetch('/api/auth/avatar', { method: 'DELETE' })
      await refreshUser()
      setSuccess('Photo de profil supprimée')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Erreur lors de la suppression')
    } finally {
      setAvatarUploading(false)
    }
  }

  const roleInfo = ROLE_LABELS[user?.role || ''] || { label: user?.role, color: '#64748b' }

  const passwordToggleStyle: React.CSSProperties = {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    lineHeight: 1,
  }

  return (
    <div className="portal-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/admin" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
          ← Retour au tableau de bord
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <h1 style={{ margin: 0 }}>Mon profil</h1>
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          padding: '3px 10px',
          borderRadius: '6px',
          background: `color-mix(in srgb, ${roleInfo.color} 15%, transparent)`,
          color: roleInfo.color,
        }}>
          {roleInfo.label}
        </span>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px' }}>
        Gerez vos informations personnelles
      </p>

      {success && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          borderRadius: '10px',
          color: '#4ade80',
          marginBottom: '24px',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          {success}
        </div>
      )}

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Photo de profil</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <UserAvatar
            name={user?.name || user?.email || '?'}
            avatarUrl={user?.avatarUrl}
            size={80}
            className="admin-sb-avatar"
            style={{ fontSize: '2rem', fontWeight: 700 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              htmlFor="avatar-upload"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: '8px',
                cursor: avatarUploading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                opacity: avatarUploading ? 0.6 : 1,
              }}
            >
              {avatarUploading ? 'Upload...' : 'Modifier la photo'}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
              disabled={avatarUploading}
            />
            {user?.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarDelete}
                disabled={avatarUploading}
                style={{
                  background: 'none',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Supprimer la photo
              </button>
            )}
            {avatarError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{avatarError}</p>}
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
              JPEG, PNG ou WebP · 2 Mo max
            </p>
          </div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Informations generales</h2>
        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Nom complet
            </label>
            <input
              className="portal-input"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Email
            </label>
            <input
              className="portal-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Telephone
              </label>
              <input
                className="portal-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Site web
              </label>
              <input
                className="portal-input"
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '14px' }}>{error}</p>}
          <button className="portal-button" type="submit" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <NotificationSettings />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <NotificationPreferencesPanel />
      </div>

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Apparence</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Mode d'affichage
            </p>
            <ThemeToggle />
          </div>
          <ColorThemePicker />
        </div>
      </div>

      <div className="portal-card">
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Changer le mot de passe</h2>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Mot de passe actuel
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                required
                style={{ width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                style={passwordToggleStyle}
                aria-label={showPasswords.current ? 'Masquer' : 'Afficher'}
              >
                {showPasswords.current ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Nouveau mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                required
                minLength={6}
                style={{ width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                style={passwordToggleStyle}
                aria-label={showPasswords.new ? 'Masquer' : 'Afficher'}
              >
                {showPasswords.new ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Confirmer le nouveau mot de passe
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                required
                style={{ width: '100%', paddingRight: '44px' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                style={passwordToggleStyle}
                aria-label={showPasswords.confirm ? 'Masquer' : 'Afficher'}
              >
                {showPasswords.confirm ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {passwordError && <p style={{ color: '#ef4444', fontSize: '14px' }}>{passwordError}</p>}
          <button className="portal-button" type="submit" disabled={savingPassword} style={{ alignSelf: 'flex-start' }}>
            {savingPassword ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}

export default AdminProfile
