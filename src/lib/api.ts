import type { ApiFetchOptions } from '../types/api.types'

export function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('auth_token', token)
  } else {
    localStorage.removeItem('auth_token')
  }
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, { ...options, headers })
  const contentType = response.headers.get('content-type') || ''

  let data: T | null = null
  if (contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    if (response.status === 401) {
      setToken(null)
      const currentPath = window.location.pathname
      if (currentPath.startsWith('/admin')) {
        window.location.href = '/admin/login'
      } else if (currentPath.startsWith('/espace-client')) {
        window.location.href = '/espace-client/login'
      }
    }
    const message = (data as Record<string, unknown>)?.error as string || 'Erreur serveur'
    throw new Error(message)
  }

  return data as T
}
