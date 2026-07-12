import type { ApiFetchOptions } from '../types/api.types'

// ─── ApiError ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload: unknown = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ─── Internal helper ────────────────────────────────────────────────────────

function handleAuth401(path: string): void {
  if (path.includes('/auth/login')) return
  const currentPath = window.location.pathname
  if (currentPath.startsWith('/admin')) {
    window.location.href = '/admin/login'
  } else if (currentPath.startsWith('/espace-client')) {
    window.location.href = '/espace-client/login'
  }
}

// ─── apiFetch ───────────────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  const contentType = response.headers.get('content-type') || ''

  let data: T | null = null
  if (contentType.includes('application/json')) {
    data = await response.json()
  }

  if (!response.ok) {
    if (response.status === 401) handleAuth401(path)
    const message = ((data as Record<string, unknown>)?.error as string) || 'Erreur serveur'
    throw new ApiError(response.status, message, data)
  }

  return data as T
}

// ─── apiUpload ──────────────────────────────────────────────────────────────

export interface ApiUploadOptions {
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  signal?: AbortSignal
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  options: ApiUploadOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  // NE PAS forcer Content-Type — laisser le browser ajouter le boundary multipart

  const response = await fetch(path, {
    method: options.method || 'POST',
    body: formData,
    headers,
    signal: options.signal,
    credentials: 'same-origin',
  })
  const contentType = response.headers.get('content-type') || ''
  let data: T | null = null
  if (contentType.includes('application/json')) {
    data = await response.json()
  }
  if (!response.ok) {
    if (response.status === 401) handleAuth401(path)
    const message = ((data as Record<string, unknown>)?.error as string) || 'Erreur upload'
    throw new ApiError(response.status, message, data)
  }
  return data as T
}

// ─── apiDownload ────────────────────────────────────────────────────────────

export interface ApiDownloadOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiDownloadResult {
  blob: Blob
  filename: string | null
  contentType: string
}

export async function apiDownload(path: string, options: ApiDownloadOptions = {}): Promise<ApiDownloadResult> {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    if (response.status === 401) handleAuth401(path)
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      /* ignore */
    }
    const message = ((payload as Record<string, unknown>)?.error as string) || 'Erreur téléchargement'
    throw new ApiError(response.status, message, payload)
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const cd = response.headers.get('content-disposition') || ''

  // Parse filename selon RFC 5987 / 6266 (filename="x" ou filename*=UTF-8''x)
  let filename: string | null = null
  const utf8Match = cd.match(/filename\*=UTF-8''([^;\n]+)/i)
  if (utf8Match) {
    try {
      filename = decodeURIComponent(utf8Match[1])
    } catch {
      filename = utf8Match[1]
    }
  } else {
    const plainMatch = cd.match(/filename="?([^";\n]+)"?/i)
    if (plainMatch) filename = plainMatch[1]
  }

  return { blob, filename, contentType }
}
