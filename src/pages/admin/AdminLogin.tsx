import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'

const AdminLogin = () => {
  const { user, login, logout } = useAuth()
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
        setError('Accès réservé aux administrateurs')
        return
      }
      navigate('/admin', { replace: true })
    } catch (err: unknown) {
      setError((err as Error).message || 'Connexion impossible')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card" style={{ maxWidth: '480px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>Connexion Admin</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          {needs2FA ? "Entrez le code de votre application d'authentification" : 'Accès réservé aux administrateurs'}
        </p>
        <form onSubmit={handleSubmit} className="portal-list">
          {!needs2FA ? (
            <>
              <input
                className="portal-input"
                type="email"
                placeholder="Email"
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
                  placeholder="Mot de passe"
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
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
              placeholder="Code 2FA (6 chiffres)"
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
            {loading ? 'Connexion...' : needs2FA ? 'Vérifier' : 'Se connecter'}
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
              Retour
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
                Mot de passe oublie ?
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
                setError((err as Error).message || 'Erreur')
              } finally {
                setLoading(false)
              }
            }}
            className="portal-list"
            style={{ marginTop: 24 }}
          >
            <h2 style={{ fontSize: 16, margin: 0, color: 'var(--text-primary)' }}>Mot de passe oublie</h2>
            <input
              className="portal-input"
              type="email"
              placeholder="Votre email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            {error && <div className="admin-error">{error}</div>}
            {success && <p style={{ color: '#22c55e', fontSize: '14px' }}>{success}</p>}
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? 'Envoi...' : 'Envoyer le lien'}
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
              Retour
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
                setSuccess(data.message + ' Vous pouvez maintenant vous connecter.')
                setResetMode(false)
              } catch (err: unknown) {
                setError((err as Error).message || 'Erreur')
              } finally {
                setLoading(false)
              }
            }}
            className="portal-list"
            style={{ marginTop: 24 }}
          >
            <h2 style={{ fontSize: 16, margin: 0, color: 'var(--text-primary)' }}>Nouveau mot de passe</h2>
            <input
              className="portal-input"
              type="password"
              placeholder="Nouveau mot de passe (6 caracteres min.)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <div className="admin-error">{error}</div>}
            {success && <p style={{ color: '#22c55e', fontSize: '14px' }}>{success}</p>}
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? 'Reinitialisation...' : 'Reinitialiser'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default AdminLogin
