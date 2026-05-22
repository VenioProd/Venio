import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiFetch, apiUpload } from '../../lib/api'
import NotificationSettings from '../../components/NotificationSettings'
import NotificationPreferencesPanel from '../../components/NotificationPreferencesPanel'
import { ColorThemePicker } from '../../components/ColorThemePicker'
import ThemeToggle from '../../components/ThemeToggle'
import UserAvatar from '../../components/UserAvatar'
import AvatarCropModal from '../../components/AvatarCropModal'
import './ClientPortal.css'

const ClientProfile = () => {
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
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
      setSuccess('Profil mis à jour avec succès')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Le mot de passe doit contenir au moins 6 caractères')
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
      setSuccess('Mot de passe modifié avec succès')
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
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError("L'image dépasse 10 Mo.")
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
      await apiUpload('/api/auth/avatar', formData)
      await refreshUser()
      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const msg = (err.payload as { error?: string } | null)?.error
        setAvatarError(msg || err.message || "Erreur lors de l'upload")
      } else {
        setAvatarError((err as Error).message || "Erreur lors de l'upload")
      }
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

  return (
    <div className="portal-container" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/espace-client" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
          ← Retour au tableau de bord
        </Link>
      </div>

      <h1 style={{ marginBottom: '8px' }}>Mon profil</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px' }}>
        Gérez vos informations personnelles
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
            className="client-sb-avatar"
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
              JPEG, PNG ou WebP · 10 Mo max
            </p>
          </div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Informations générales</h2>
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
              value={user?.email || ''}
              disabled
              style={{ opacity: 0.5 }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              L'email ne peut pas être modifié. Contactez votre administrateur.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Téléphone
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
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Entreprise
            </label>
            <input
              className="portal-input"
              type="text"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
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
            <input
              className="portal-input"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Nouveau mot de passe
            </label>
            <input
              className="portal-input"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              required
              minLength={6}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Confirmer le nouveau mot de passe
            </label>
            <input
              className="portal-input"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
            />
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

export default ClientProfile
