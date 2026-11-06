import PageHeader from '../../components/admin/ui/PageHeader'
import './OrganisationSysteme.css'
import { Eye, EyeOff } from 'lucide-react'
import './AdminPortal.css'
import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'
import SecondFactorStep from '../../components/auth/SecondFactorStep'
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter'
import { MIN_PASSWORD_LENGTH } from '../../lib/passwordPolicy'
import type { LoginResult } from '../../types/auth.types'

const AdminLogin = () => {
  const { user, login, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('reset')
  const [form, setForm] = useState<{ email: string; password: string }>({ email: '', password: '' })
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const needs2FA = mfaToken !== null
  const [forgotMode, setForgotMode] = useState(false)
  const [resetMode, setResetMode] = useState(!!resetToken)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState(
    searchParams.get('passwordChanged') === '1' ? t('security.password.changed') : '',
  )
  const [loading, setLoading] = useState<boolean>(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (resetToken) setResetMode(true)
  }, [resetToken])

  if (user?.role && isAdminRole(user.role)) {
    return <Navigate to="/admin" replace />
  }
  // Les commerciaux externes se connectent ici et rejoignent leur espace.
  if (user?.role === 'COMMERCIAL_EXTERNE') {
    return <Navigate to="/commercial" replace />
  }

  // Suite commune après le mot de passe seul ou après le second facteur.
  const afterSignIn = async (result: LoginResult) => {
    if (result.mfaEnrollmentRequired) {
      navigate('/admin/mfa-setup', { replace: true })
      return
    }
    if (result.user?.role === 'COMMERCIAL_EXTERNE') {
      navigate(result.passwordNeedsUpgrade ? '/commercial/securite?renforcer=1' : '/commercial', { replace: true })
      return
    }
    if (!result.user || !isAdminRole(result.user.role)) {
      await logout()
      setMfaToken(null)
      setError(t('adminAccess.login.adminOnly'))
      return
    }
    navigate(result.passwordNeedsUpgrade ? '/admin/securite?renforcer=1' : '/admin', { replace: true })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(form.email, form.password)
      if (result.mfaToken) {
        setMfaToken(result.mfaToken)
        setLoading(false)
        return
      }
      await afterSignIn(result)
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.login.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-container lot-c-page admin-login-page">
      <div className="portal-card">
        <PageHeader
          eyebrow={t('adminOps.zone.system')}
          title={t('adminAccess.login.title')}
          subtitle={needs2FA ? t('adminAccess.login.enterCode') : t('adminAccess.login.adminOnly')}
        />
        {needs2FA && mfaToken && (
          <SecondFactorStep
            mfaToken={mfaToken}
            onVerified={(result) => {
              afterSignIn(result).catch((err: unknown) =>
                setError((err as Error).message || t('adminAccess.login.failed')),
              )
            }}
            onRestart={(message) => {
              setMfaToken(null)
              setError(message ?? '')
            }}
          />
        )}
        <form onSubmit={handleSubmit} className="portal-list" hidden={needs2FA}>
          {!needs2FA && (
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
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </>
          )}
          {error && <div className="admin-error">{error}</div>}
          <button className="portal-button" type="submit" disabled={loading}>
            {loading ? t('adminAccess.login.signingIn') : t('adminAccess.login.signIn')}
          </button>
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
          {success && <p style={{ color: 'var(--good)', fontSize: '14px' }}>{success}</p>}
        </form>

        {needs2FA && error && <div className="admin-error">{error}</div>}

        {forgotMode && !needs2FA && (
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
            {success && <p style={{ color: 'var(--good)', fontSize: '14px' }}>{success}</p>}
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
              autoComplete="new-password"
              placeholder={t('adminAccess.login.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
            <PasswordStrengthMeter password={newPassword} />
            {error && <div className="admin-error">{error}</div>}
            {success && <p style={{ color: 'var(--good)', fontSize: '14px' }}>{success}</p>}
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
