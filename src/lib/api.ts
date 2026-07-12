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
  if (typeof window === 'undefined') return
  const currentPath = window.location.pathname
  if (currentPath.startsWith('/admin')) {
    window.location.href = '/admin/login'
  } else if (currentPath.startsWith('/espace-client')) {
    window.location.href = '/espace-client/login'
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null

  try {
    if (isJsonResponse(response)) return await response.json()
    const text = await response.text()
    return text || null
  } catch {
    return null
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const { error, message } = payload as Record<string, unknown>
    if (typeof error === 'string' && error) return error
    if (typeof message === 'string' && message) return message
  }
  return typeof payload === 'string' && payload ? payload : fallback
}

function throwApiError(response: Response, payload: unknown, fallback: string, path: string): never {
  if (response.status === 401) handleAuth401(path)
  throw new ApiError(response.status, errorMessage(payload, fallback), payload)
}

// ─── apiFetch ───────────────────────────────────────────────────────────────

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...options, headers, credentials: options.credentials ?? 'same-origin' })
  const data = await readResponsePayload(response)

  if (!response.ok) {
    throwApiError(response, data, 'Erreur serveur', path)
  }

  return data as T
}

// ─── apiUpload ──────────────────────────────────────────────────────────────

export interface ApiUploadOptions {
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: HeadersInit
  signal?: AbortSignal
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  options: ApiUploadOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  // NE PAS forcer Content-Type — laisser le browser ajouter le boundary multipart

  const response = await fetch(path, {
    method: options.method || 'POST',
    body: formData,
    headers,
    signal: options.signal,
    credentials: 'same-origin',
  })
  const data = await readResponsePayload(response)
  if (!response.ok) {
    throwApiError(response, data, 'Erreur upload', path)
  }
  return data as T
}

// ─── apiDownload ────────────────────────────────────────────────────────────

export interface ApiDownloadOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
}

export interface ApiDownloadResult {
  blob: Blob
  filename: string | null
  contentType: string
}

/**
 * Extract a safe suggested download name from Content-Disposition (RFC 6266).
 * This only affects the browser's local download attribute; it never changes
 * the response blob or server-provided content type.
 */
export function filenameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null

  const params: Record<string, string> = {}
  for (const match of contentDisposition.matchAll(/;\s*([^=;\s]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]*))/g)) {
    const key = match[1].toLowerCase()
    const value = (match[2] ?? match[3] ?? '').trim().replace(/\\(.)/g, '$1')
    params[key] = value
  }

  let filename = params['filename*']
  if (filename) {
    const extended = filename.match(/^([^']*)'[^']*'(.*)$/)
    if (extended) {
      const [, charset, encoded] = extended
      try {
        if (!charset || /^utf-?8$/i.test(charset)) {
          filename = decodeURIComponent(encoded)
        } else if (/^(iso-8859-1|latin1)$/i.test(charset)) {
          const bytes = encoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
          filename = new TextDecoder('iso-8859-1').decode(Uint8Array.from(bytes, (char) => char.charCodeAt(0)))
        } else {
          filename = decodeURIComponent(encoded)
        }
      } catch {
        filename = encoded
      }
    }
  } else {
    filename = params.filename
  }

  if (!filename) return null
  const filenameLeaf = filename
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .pop()
  const safeFilename = Array.from(filenameLeaf ?? '')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
  return safeFilename && !/^\.+$/.test(safeFilename) ? safeFilename : null
}

export async function apiDownload(path: string, options: ApiDownloadOptions = {}): Promise<ApiDownloadResult> {
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throwApiError(response, await readResponsePayload(response), 'Erreur téléchargement', path)
  }

  const blob = await response.blob()
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const filename = filenameFromContentDisposition(response.headers.get('content-disposition'))

  return { blob, filename, contentType }
}
