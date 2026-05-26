import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, getToken, setToken } from '../lib/api'
import { resolveUserPermissions } from '../lib/permissions'
import type { AuthContextValue, User } from '../types/auth.types'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const isRedirectingRef = useRef(false)

  const loadUser = async (): Promise<User | null> => {
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me')
      const permissions = resolveUserPermissions(data.user)
      const normalizedUser = { ...data.user, permissions } as User
      setUser(normalizedUser)
      // Sync locale preference from backend if set
      if (normalizedUser.locale) {
        try { localStorage.setItem('venio-lang', normalizedUser.locale) } catch {}
      }
      return normalizedUser
    } catch (err) {
      setUser(null)
      setToken(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Handle impersonation via URL parameter
    const params = new URLSearchParams(window.location.search)
    const impersonateToken = params.get('impersonate')
    if (impersonateToken) {
      setToken(impersonateToken)
      // Clean URL
      params.delete('impersonate')
      const cleanUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
      loadUser()
      return
    }

    const token = getToken()
    if (token) {
      loadUser()
    } else {
      setLoading(false)
    }
  }, [])

  // Écoute l'event émis par lib/api.ts sur 401. Évite le hard reload qui casse
  // le cache SPA et provoque un flash blanc. Guard via ref pour ignorer les 401
  // multiples concurrents (plusieurs requêtes en parallèle après expiration).
  useEffect(() => {
    const handler = (event: Event) => {
      if (isRedirectingRef.current) return
      isRedirectingRef.current = true
      setUser(null)
      const scope = (event as CustomEvent<{ scope?: 'admin' | 'client' }>).detail?.scope
      const target = scope === 'client' ? '/espace-client/login' : '/admin/login'
      navigate(target, { replace: true })
      // Reset le guard au tick suivant pour autoriser un futur redirect après reconnexion.
      setTimeout(() => { isRedirectingRef.current = false }, 0)
    }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [navigate])

  const login = async (email: string, password: string, totpCode?: string) => {
    const data = await apiFetch<{ token?: string; requires2FA?: boolean; user?: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
    })
    if (data.requires2FA) {
      return { requires2FA: true }
    }
    if (data.token) {
      setToken(data.token)
      const currentUser = await loadUser()
      return { token: data.token, user: currentUser }
    }
    return {}
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser: loadUser,
    }),
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
