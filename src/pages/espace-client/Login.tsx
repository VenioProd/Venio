import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAdminRole } from '../../lib/permissions'
import './ClientPortal.css'

interface LoginForm {
  email: string
  password: string
}

const ClientLogin = () => {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [showPassword, setShowPassword] = useState(false)

  if (user?.role === 'CLIENT') {
    return <Navigate to="/espace-client" replace />
  }
  if (user?.role && isAdminRole(user.role)) {
    return <Navigate to="/admin" replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(form.email, form.password)
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

  return (
    <div className="portal-container">
      <div className="portal-card">
        <h1>Espace client</h1>
        <p>Connectez-vous pour acceder a vos projets.</p>
        <form onSubmit={handleSubmit} className="portal-list">
          <input
            className="portal-input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <div style={{ position: 'relative' }}>
            <input
              className="portal-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
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
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          {error && <p style={{ color: '#ef4444' }}>{error}</p>}
          <button className="portal-button" type="submit" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px' }}>
            <a href="mailto:contact@venio.fr?subject=Réinitialisation mot de passe" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
              Mot de passe oublié ?
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}

export default ClientLogin
