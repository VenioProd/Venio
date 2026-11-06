import './AdminPortal.css'
import PageHeader from '../../components/admin/ui/PageHeader'
import './OrganisationSysteme.css'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import { apiFetch, apiUpload } from '../../lib/api'
import NotificationSettings from '../../components/NotificationSettings'
import NotificationPreferencesPanel from '../../components/NotificationPreferencesPanel'
import UserAvatar from '../../components/UserAvatar'
import AvatarCropModal from '../../components/AvatarCropModal'
import LanguageSelect from '../../components/LanguageSelect'
import '../espace-client/ClientPortal.css'
import { passwordIssue } from '../../lib/passwordPolicy'

const ROLE_LABELS: Record<string, { labelKey: MessageKey; color: string }> = {
  SUPER_ADMIN: { labelKey: 'adminAccess.profile.roleSuperAdmin', color: 'var(--primary)' },
  ADMIN: { labelKey: 'adminAccess.profile.roleSales', color: 'var(--primary)' },
  VIEWER: { labelKey: 'adminAccess.profile.roleViewer', color: 'var(--text-muted)' },
}

const AdminProfile = () => {
  const { user, refreshUser } = useAuth()
  const { t } = useI18n()
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
      setSuccess(t('adminAccess.profile.profileUpdated'))
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.profile.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    const issue = passwordIssue(passwordForm.newPassword, { email: user?.email, name: user?.name })
    if (issue) {
      setPasswordError(
        issue === 'tooShort'
          ? t('adminAccess.profile.passwordTooShort')
          : t(`security.issue.${issue}` as 'security.issue.tooShort'),
      )
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('adminAccess.profile.passwordMismatch'))
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
      setSuccess(t('adminAccess.profile.passwordChanged'))
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setPasswordError((err as Error).message || t('adminAccess.profile.passwordChangeFailed'))
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
      setAvatarError(t('adminAccess.profile.avatarBadFormat'))
      e.target.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError(t('adminAccess.profile.avatarTooLarge'))
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
      setSuccess(t('adminAccess.profile.avatarUpdated'))
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || t('adminAccess.profile.avatarUploadFailed'))
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
      setSuccess(t('adminAccess.profile.avatarDeleted'))
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || t('adminAccess.profile.avatarDeleteFailed'))
    } finally {
      setAvatarUploading(false)
    }
  }

  const knownRole = ROLE_LABELS[user?.role || '']
  const roleInfo = knownRole
    ? { label: t(knownRole.labelKey), color: knownRole.color }
    : { label: user?.role, color: 'var(--text-muted)' }

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
    <div className="portal-container lot-c-page admin-profile-page" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <PageHeader
        eyebrow={t('adminOps.zone.team')}
        title={t('adminAccess.profile.title')}
        subtitle={t('adminAccess.profile.subtitle')}
        actions={
          <>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 'var(--r-sm)',
                background: `color-mix(in srgb, ${roleInfo.color} 15%, transparent)`,
                color: roleInfo.color,
              }}
            >
              {roleInfo.label}
            </span>
            <Link className="portal-button secondary" to="/admin">
              {t('adminAccess.profile.backToDashboard')}
            </Link>
          </>
        }
      />

      {success && (
        <div
          style={{
            padding: '12px 16px',
            background: 'color-mix(in srgb, var(--good) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--good) 30%, transparent)',
            borderRadius: 'var(--r-md)',
            color: 'var(--good)',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>{t('adminAccess.profile.avatarHeading')}</h2>
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
                color: 'var(--text-primary)',
                borderRadius: 'var(--r-md)',
                cursor: avatarUploading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                opacity: avatarUploading ? 0.6 : 1,
              }}
            >
              {avatarUploading ? t('adminAccess.profile.avatarUploading') : t('adminAccess.profile.avatarChange')}
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
                  border: '1px solid color-mix(in srgb, var(--critical) 40%, transparent)',
                  color: 'var(--critical)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {t('adminAccess.profile.avatarRemove')}
              </button>
            )}
            {avatarError && <p style={{ color: 'var(--critical)', fontSize: '13px', margin: 0 }}>{avatarError}</p>}
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
              {t('adminAccess.profile.avatarHint')}
            </p>
          </div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>{t('adminAccess.profile.generalHeading')}</h2>
        <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              {t('adminAccess.profile.fullName')}
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
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              {t('adminAccess.profile.email')}
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
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                {t('adminAccess.profile.phone')}
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
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}
              >
                {t('adminAccess.profile.website')}
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
          {error && <p style={{ color: 'var(--critical)', fontSize: '14px' }}>{error}</p>}
          <button className="portal-button" type="submit" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? t('adminAccess.profile.saving') : t('adminAccess.profile.saveChanges')}
          </button>
        </form>
      </div>

      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>{t('common.language')}</h2>
        <LanguageSelect />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <NotificationSettings />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <NotificationPreferencesPanel />
      </div>

      <div className="portal-card">
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>{t('adminAccess.profile.passwordHeading')}</h2>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '14px' }}>
          <Link to={user?.role === 'COMMERCIAL_EXTERNE' ? '/commercial/securite' : '/admin/securite'}>
            {t('security.navLink')}
          </Link>
        </p>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              {t('adminAccess.profile.currentPassword')}
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
                aria-label={showPasswords.current ? t('adminAccess.profile.hide') : t('adminAccess.profile.show')}
              >
                {showPasswords.current ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              {t('adminAccess.profile.newPassword')}
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
                aria-label={showPasswords.new ? t('adminAccess.profile.hide') : t('adminAccess.profile.show')}
              >
                {showPasswords.new ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              {t('adminAccess.profile.confirmPassword')}
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
                aria-label={showPasswords.confirm ? t('adminAccess.profile.hide') : t('adminAccess.profile.show')}
              >
                {showPasswords.confirm ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {passwordError && <p style={{ color: 'var(--critical)', fontSize: '14px' }}>{passwordError}</p>}
          <button className="portal-button" type="submit" disabled={savingPassword} style={{ alignSelf: 'flex-start' }}>
            {savingPassword ? t('adminAccess.profile.changing') : t('adminAccess.profile.passwordHeading')}
          </button>
        </form>
      </div>
      {cropFile && <AvatarCropModal file={cropFile} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />}
    </div>
  )
}

export default AdminProfile
