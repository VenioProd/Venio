import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
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
      // Sync locale preference from backend if set
      if (normalizedUser.locale) {
        try {
          localStorage.setItem('venio-lang', normalizedUser.locale)
        } catch {}
      }
      return normalizedUser
    } catch (err) {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Authentication is represented exclusively by the HttpOnly session cookie.
    // /me lets the server decide whether a browser session is still active.
    loadUser()
  }, [])

  const login = async (email: string, password: string, totpCode?: string) => {
    const data = await apiFetch<{ requires2FA?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}) }),
    })
    if (data.requires2FA) {
      return { requires2FA: true }
    }
    const currentUser = await loadUser()
    return { user: currentUser }
  }

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clear local state even when an expired session has already been rejected.
    }
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
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
