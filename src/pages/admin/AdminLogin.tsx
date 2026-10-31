import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'

const AdminLogin = () => {
  const { user, login, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('reset')
  const [form, setForm] = useState<{ email: string; password: string }>({ email: '', password: '' })
  const [totpCode, setTotpCode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [resetMode, setResetMode] = useState(!!resetToken)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState<boolean>(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (resetToken) setResetMode(true)
  }, [resetToken])

  if (user?.role && isAdminRole(user.role)) {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(form.email, form.password, needs2FA ? totpCode : undefined)
      if (result.requires2FA) {
        setNeeds2FA(true)
        setLoading(false)
        return
      }
      if (result.mfaEnrollmentRequired) {
        navigate('/admin/mfa-setup', { replace: true })
        return
      }
      if (!result.user || !isAdminRole(result.user.role)) {
        await logout()
        setError(t('adminAccess.login.adminOnly'))
        return
      }
      navigate('/admin', { replace: true })
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.login.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card" style={{ maxWidth: '480px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>{t('adminAccess.login.title')}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          {needs2FA ? t('adminAccess.login.enterCode') : t('adminAccess.login.adminOnly')}
        </p>
        <form onSubmit={handleSubmit} className="portal-list">
          {!needs2FA ? (
            <>
              <input
                className="portal-input"
                type="email"
                placeholder={t('adminAccess.login.email')}
                value={form.email}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('adminAccess.login.password')}
                  value={form.password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  required
                  style={{ width: '100%', paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
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
                  }}
                  aria-label={showPassword ? t('adminAccess.login.hidePassword') : t('adminAccess.login.showPassword')}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </>
          ) : (
            <input
              className="portal-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('adminAccess.login.codePlaceholder')}
              value={totpCode}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))
              }
              maxLength={6}
              required
              autoFocus
            />
          )}
          {error && <div className="admin-error">{error}</div>}
          <button className="portal-button" type="submit" disabled={loading}>
            {loading
              ? t('adminAccess.login.signingIn')
              : needs2FA
                ? t('adminAccess.login.verify')
                : t('adminAccess.login.signIn')}
          </button>
          {needs2FA && (
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '14px',
                marginTop: '8px',
              }}
              onClick={() => {
                setNeeds2FA(false)
                setTotpCode('')
                setError('')
              }}
            >
              {t('adminAccess.login.back')}
            </button>
          )}
          {!needs2FA && !forgotMode && !resetMode && (
            <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  setForgotMode(true)
                  setError('')
                  setSuccess('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('adminAccess.login.forgotLink')}
              </button>
            </p>
          )}
          {success && <p style={{ color: '#22c55e', fontSize: '14px' }}>{success}</p>}
        </form>

        {forgotMode && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              setSuccess('')
              setLoading(true)
              try {
                const data = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
                  method: 'POST',
                  body: JSON.stringify({ email: form.email }),
                })
                setSuccess(data.message)
              } catch (err: unknown) {
                setError((err as Error).message || t('adminAccess.login.genericError'))
              } finally {
                setLoading(false)
              }
            }}
            className="portal-list"
            style={{ marginTop: 24 }}
          >
            <h2 style={{ fontSize: 16, margin: 0, color: 'var(--text-primary)' }}>
              {t('adminAccess.login.forgotTitle')}
            </h2>
            <input
              className="portal-input"
              type="email"
              placeholder={t('adminAccess.login.yourEmail')}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            {error && <div className="admin-error">{error}</div>}
            {success && <p style={{ color: '#22c55e', fontSize: '14px' }}>{success}</p>}
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? t('adminAccess.login.sending') : t('adminAccess.login.sendLink')}
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotMode(false)
                setError('')
                setSuccess('')
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {t('adminAccess.login.back')}
            </button>
          </form>
        )}

        {resetMode && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              setSuccess('')
              setLoading(true)
              try {
                const data = await apiFetch<{ message: string }>('/api/auth/reset-password', {
                  method: 'POST',
                  body: JSON.stringify({ token: resetToken, password: newPassword }),
                })
                setSuccess(`${data.message} ${t('adminAccess.login.canSignInNow')}`)
                setResetMode(false)
              } catch (err: unknown) {
                setError((err as Error).message || t('adminAccess.login.genericError'))
              } finally {
                setLoading(false)
              }
            }}
            className="portal-list"
            style={{ marginTop: 24 }}
          >
            <h2 style={{ fontSize: 16, margin: 0, color: 'var(--text-primary)' }}>
              {t('adminAccess.login.newPasswordTitle')}
            </h2>
            <input
              className="portal-input"
              type="password"
              placeholder={t('adminAccess.login.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <div className="admin-error">{error}</div>}
            {success && <p style={{ color: '#22c55e', fontSize: '14px' }}>{success}</p>}
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? t('adminAccess.login.resetting') : t('adminAccess.login.reset')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default AdminLogin
