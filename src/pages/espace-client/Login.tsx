import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import './ClientPortal.css'
import SecondFactorStep from '../../components/auth/SecondFactorStep'
import PasswordStrengthMeter from '../../components/auth/PasswordStrengthMeter'
import { MIN_PASSWORD_LENGTH } from '../../lib/passwordPolicy'
import type { LoginResult } from '../../types/auth.types'

type Mode = 'login' | 'mfa' | 'forgot' | 'reset'

const ClientLogin = () => {
  const { t } = useI18n()
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const resetToken = searchParams.get('reset')
  const returnTo = searchParams.get('returnTo') === '/espace-client/invitation' ? '/espace-client/invitation' : null
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(
    searchParams.get('passwordChanged') === '1' ? t('security.password.changed') : '',
  )
  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (resetToken) setMode('reset')
  }, [resetToken])

  if (user?.role === 'CLIENT') {
    return <Navigate to={returnTo || '/espace-client'} replace />
  }
  if (user?.role && isAdminRole(user.role)) {
    return <Navigate to="/admin" replace />
  }

  const afterSignIn = (result: LoginResult) => {
    if (result.user?.role && isAdminRole(result.user.role)) {
      navigate(result.passwordNeedsUpgrade ? '/admin/securite?renforcer=1' : '/admin', { replace: true })
      return
    }
    if (result.passwordNeedsUpgrade) {
      navigate('/espace-client/securite?renforcer=1', { replace: true })
      return
    }
    navigate(returnTo || '/espace-client', { replace: true })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.mfaToken) {
        setMfaToken(result.mfaToken)
        setMode('mfa')
        return
      }
      afterSignIn(result)
    } catch (err: unknown) {
      setError((err as Error).message || t('client.login.signInError'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setSuccess(data.message)
    } catch (err: unknown) {
      setError((err as Error).message || t('client.login.genericError'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      })
      setSuccess(`${data.message} ${t('client.login.resetDone')}`)
      setMode('login')
    } catch (err: unknown) {
      setError((err as Error).message || t('client.login.genericError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        {mode === 'login' && (
          <>
            <h1>{t('client.login.title')}</h1>
            <p>{t('client.login.intro')}</p>
            <form onSubmit={handleLogin} className="portal-list">
              <input
                className="portal-input"
                type="email"
                placeholder={t('client.login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('client.login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px',
                    lineHeight: 1,
                  }}
                  aria-label={showPassword ? t('client.login.hidePassword') : t('client.login.showPassword')}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? t('client.login.signingIn') : t('client.login.signIn')}
              </button>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot')
                    setError('')
                    setSuccess('')
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textDecoration: 'none',
                  }}
                >
                  {t('client.login.forgotLink')}
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'mfa' && mfaToken && (
          <>
            <h1>{t('security.login.codeTitle')}</h1>
            <SecondFactorStep
              mfaToken={mfaToken}
              errorStyle={{ color: '#ef4444' }}
              onVerified={afterSignIn}
              onRestart={(message) => {
                setMfaToken(null)
                setMode('login')
                setError(message ?? '')
              }}
            />
          </>
        )}

        {mode === 'forgot' && (
          <>
            <h1>{t('client.login.forgotTitle')}</h1>
            <p>{t('client.login.forgotIntro')}</p>
            <form onSubmit={handleForgotPassword} className="portal-list">
              <input
                className="portal-input"
                type="email"
                placeholder={t('client.login.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? t('client.login.sending') : t('client.login.sendLink')}
              </button>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
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
                  {t('client.login.backToSignIn')}
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'reset' && (
          <>
            <h1>{t('client.login.resetTitle')}</h1>
            <p>{t('client.login.resetIntro')}</p>
            <form onSubmit={handleResetPassword} className="portal-list">
              <input
                className="portal-input"
                type="password"
                autoComplete="new-password"
                placeholder={t('client.login.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
              <PasswordStrengthMeter password={newPassword} />
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? t('client.login.resetting') : t('client.login.reset')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default ClientLogin
