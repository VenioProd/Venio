import React, { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import { isAdminRole } from '../../lib/permissions'
import './ClientPortal.css'

type Mode = 'login' | 'forgot' | 'reset'

const ClientLogin = () => {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const resetToken = searchParams.get('reset')
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (resetToken) setMode('reset')
  }, [resetToken])

  if (user?.role === 'CLIENT') {
    return <Navigate to="/espace-client" replace />
  }
  if (user?.role && isAdminRole(user.role)) {
    return <Navigate to="/admin" replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.user?.role && isAdminRole(result.user.role)) {
        navigate('/admin', { replace: true })
        return
      }
      navigate('/espace-client', { replace: true })
    } catch (err: unknown) {
      setError((err as Error).message || 'Connexion impossible')
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
      setError((err as Error).message || 'Erreur')
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
      setSuccess(data.message + ' Vous pouvez maintenant vous connecter.')
      setMode('login')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        {mode === 'login' && (
          <>
            <h1>Espace client</h1>
            <p>Connectez-vous pour acceder a vos projets.</p>
            <form onSubmit={handleLogin} className="portal-list">
              <input
                className="portal-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ width: '100%', paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1,
                  }}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '14px', textDecoration: 'none' }}
                >
                  Mot de passe oublie ?
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <h1>Mot de passe oublie</h1>
            <p>Entrez votre email, nous vous enverrons un lien de reinitialisation.</p>
            <form onSubmit={handleForgotPassword} className="portal-list">
              <input
                className="portal-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </button>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '14px' }}
                >
                  Retour a la connexion
                </button>
              </p>
            </form>
          </>
        )}

        {mode === 'reset' && (
          <>
            <h1>Nouveau mot de passe</h1>
            <p>Choisissez votre nouveau mot de passe.</p>
            <form onSubmit={handleResetPassword} className="portal-list">
              <input
                className="portal-input"
                type="password"
                placeholder="Nouveau mot de passe (6 caracteres minimum)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              {error && <p style={{ color: '#ef4444' }}>{error}</p>}
              {success && <p style={{ color: '#22c55e' }}>{success}</p>}
              <button className="portal-button" type="submit" disabled={loading}>
                {loading ? 'Reinitialisation...' : 'Reinitialiser'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default ClientLogin
