/**
 * Nextcloud WebDAV integration for automatic folder creation
 *
 * Uses WebDAV MKCOL to create folders on Nextcloud when a client account is created.
 * Requires the following environment variables:
 * - NEXTCLOUD_URL: Base URL of the Nextcloud instance (e.g., https://cloud.example.com)
 * - NEXTCLOUD_USER: Nextcloud username
 * - NEXTCLOUD_APP_PASSWORD: App password (generate in Nextcloud > Settings > Security > App passwords)
 * - NEXTCLOUD_BASE_PATH: Base path for client folders (e.g., /Venio/Clients)
 */

interface NextcloudConfig {
  url: string
  user: string
  password: string
  basePath: string
}

interface FolderResult {
  success: boolean
  alreadyExists?: boolean
  error?: string
}

interface ClientFoldersResult {
  success: boolean
  path?: string
  created?: string[]
  errors?: string[]
  error?: string
}

interface CloudFolder {
  name: string
  path: string
  webUrl: string
}

interface ClientCloudInfo {
  enabled: boolean
  clientFolder?: string
  webUrl?: string
  folders?: CloudFolder[]
  error?: string
}

// Getters to read env vars at runtime (after dotenv has loaded them)
const getConfig = (): NextcloudConfig => ({
  url: process.env.NEXTCLOUD_URL || '',
  user: process.env.NEXTCLOUD_USER || '',
  password: process.env.NEXTCLOUD_APP_PASSWORD || '',
  basePath: process.env.NEXTCLOUD_BASE_PATH || '/Venio/Clients',
})

const isConfigured = (): boolean => {
  const { url, user, password } = getConfig()
  return Boolean(url && user && password)
}

// Log warning once on first use if not configured
let hasLoggedWarning = false

// Subfolders to create for each client
const CLIENT_SUBFOLDERS: string[] = [
  'Contrats',
  'Devis',
  'Factures',
  'Livrables',
  'Communication',
  'Briefs',
  'Assets',
]

/**
 * Sanitize a folder name to prevent path traversal and invalid characters
 */
function sanitizeFolderName(name: string): string {
  if (!name || typeof name !== 'string') return ''

  return name
    .trim()
    // Remove path separators and traversal attempts
    .replace(/[/\\]/g, '-')
    .replace(/\.\./g, '')
    // Remove characters that are problematic in URLs or file systems
    .replace(/[<>:"|?*]/g, '')
    // Collapse multiple dashes/spaces
    .replace(/--+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build the WebDAV URL for a given path
 */
function buildWebDavUrl(path: string): string {
  const { url, user } = getConfig()
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  // Encode each path segment separately to handle special characters
  const encodedPath = cleanPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${url}/remote.php/dav/files/${user}/${encodedPath}`
}

/**
 * Build the Authorization header for Basic Auth
 */
function buildAuthHeader(): string {
  const { user, password } = getConfig()
  const credentials = Buffer.from(`${user}:${password}`).toString('base64')
  return `Basic ${credentials}`
}

/**
 * Create a single folder via WebDAV MKCOL
 */
export async function createFolder(path: string): Promise<FolderResult> {
  if (!isConfigured()) {
    return { success: false, error: 'Nextcloud not configured' }
  }

  const url = buildWebDavUrl(path)

  try {
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: {
        Authorization: buildAuthHeader(),
      },
    })

    // 201 Created = success
    // 405 Method Not Allowed = folder already exists (idempotent, treat as success)
    if (response.status === 201) {
      return { success: true }
    }

    if (response.status === 405) {
      return { success: true, alreadyExists: true }
    }

    // Other errors
    const text = await response.text().catch(() => '')
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
    }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message || 'Network error',
    }
  }
}

/**
 * Create the full folder structure for a new client
 * Creates: {NEXTCLOUD_BASE_PATH}/{clientName}/ and all subfolders
 */
export async function createClientFolders(clientName: string, clientId: string | null = null): Promise<ClientFoldersResult> {
  if (!isConfigured()) {
    if (!hasLoggedWarning) {
      console.warn('[Nextcloud] Skipping folder creation — not configured. Set NEXTCLOUD_URL, NEXTCLOUD_USER, and NEXTCLOUD_APP_PASSWORD to enable.')
      hasLoggedWarning = true
    }
    return { success: false, error: 'Nextcloud not configured' }
  }

  // Sanitize and validate the client name
  const sanitized = sanitizeFolderName(clientName)
  const folderName = sanitized || (clientId ? `client-${clientId}` : null)

  if (!folderName) {
    console.error('[Nextcloud] Cannot create folders: no valid client name or ID')
    return { success: false, error: 'No valid client name' }
  }

  const { basePath: configBasePath } = getConfig()
  const basePath = configBasePath.endsWith('/')
    ? configBasePath.slice(0, -1)
    : configBasePath

  const clientPath = `${basePath}/${folderName}`
  const created: string[] = []
  const errors: string[] = []

  console.log(`[Nextcloud] Creating folders for client: ${folderName}`)

  // First, ensure the base path exists (create parent folders)
  // Split basePath and create each level
  const baseSegments = basePath.split('/').filter(Boolean)
  let currentPath = ''
  for (const segment of baseSegments) {
    currentPath += `/${segment}`
    const result = await createFolder(currentPath)
    if (!result.success && !result.alreadyExists) {
      // Log but continue - the folder might exist
      console.warn(`[Nextcloud] Warning creating base path ${currentPath}: ${result.error}`)
    }
  }

  // Create the client's main folder
  const mainResult = await createFolder(clientPath)
  if (mainResult.success) {
    created.push(clientPath)
    if (!mainResult.alreadyExists) {
      console.log(`[Nextcloud] Created: ${clientPath}`)
    }
  } else {
    errors.push(`${clientPath}: ${mainResult.error}`)
    console.error(`[Nextcloud] Failed to create ${clientPath}: ${mainResult.error}`)
  }

  // Create subfolders
  for (const subfolder of CLIENT_SUBFOLDERS) {
    const subPath = `${clientPath}/${subfolder}`
    const result = await createFolder(subPath)
    if (result.success) {
      created.push(subPath)
      if (!result.alreadyExists) {
        console.log(`[Nextcloud] Created: ${subPath}`)
      }
    } else {
      errors.push(`${subPath}: ${result.error}`)
      console.error(`[Nextcloud] Failed to create ${subPath}: ${result.error}`)
    }
  }

  const success = errors.length === 0
  if (success) {
    console.log(`[Nextcloud] Successfully created folder structure for ${folderName}`)
  } else {
    console.warn(`[Nextcloud] Completed with ${errors.length} error(s) for ${folderName}`)
  }

  return {
    success,
    path: clientPath,
    created,
    ...(errors.length > 0 ? { errors } : {}),
  }
}

/**
 * Build a Nextcloud web UI URL to open a folder in the browser
 */
function buildWebUrl(folderPath: string): string {
  const { url } = getConfig()
  const cleanPath = folderPath.startsWith('/') ? folderPath : `/${folderPath}`
  return `${url}/apps/files/?dir=${encodeURIComponent(cleanPath)}`
}

/**
 * Get the folder structure info for a client (names + web URLs)
 */
export function getClientCloudInfo(clientName: string, clientId: string | null = null): ClientCloudInfo {
  if (!isConfigured()) {
    return { enabled: false }
  }

  const sanitized = sanitizeFolderName(clientName)
  const folderName = sanitized || (clientId ? `client-${clientId}` : null)

  if (!folderName) {
    return { enabled: true, error: 'No valid client name' }
  }

  const { basePath: configBasePath } = getConfig()
  const basePath = configBasePath.endsWith('/') ? configBasePath.slice(0, -1) : configBasePath
  const clientPath = `${basePath}/${folderName}`

  const folders = CLIENT_SUBFOLDERS.map((name) => {
    const path = `${clientPath}/${name}`
    return {
      name,
      path,
      webUrl: buildWebUrl(path),
    }
  })

  return {
    enabled: true,
    clientFolder: folderName,
    webUrl: buildWebUrl(clientPath),
    folders,
  }
}

/**
 * Check if Nextcloud integration is enabled
 */
export function isNextcloudEnabled(): boolean {
  return isConfigured()
}
