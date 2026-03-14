import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, getToken, setToken } from '../lib/api'
import { resolveUserPermissions } from '../lib/permissions'
import type { AuthContextValue, User } from '../types/auth.types'

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = async (): Promise<User | null> => {
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/me')
      const permissions = resolveUserPermissions(data.user)
      const normalizedUser = { ...data.user, permissions } as User
      setUser(normalizedUser)
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
