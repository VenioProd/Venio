import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAdminRole } from '../../lib/permissions'
import '../espace-client/ClientPortal.css'

const AdminLogin = () => {
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<{ email: string; password: string }>({ email: '', password: '' })
  const [totpCode, setTotpCode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [showPassword, setShowPassword] = useState(false)

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
      if (!result.user || !isAdminRole(result.user.role)) {
        logout()
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
          {needs2FA ? 'Entrez le code de votre application d\'authentification' : 'Accès réservé aux administrateurs'}
        </p>
        <form onSubmit={handleSubmit} className="portal-list">
          {!needs2FA ? (
            <>
              <input
                className="portal-input"
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: event.target.value })}
                required
              />
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  value={form.password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
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
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
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
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '14px', marginTop: '8px' }}
              onClick={() => { setNeeds2FA(false); setTotpCode(''); setError('') }}
            >
              Retour
            </button>
          )}
          {!needs2FA && (
            <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
              <a href="mailto:contact@venio.fr?subject=Réinitialisation mot de passe admin" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                Mot de passe oublié ?
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

export default AdminLogin
