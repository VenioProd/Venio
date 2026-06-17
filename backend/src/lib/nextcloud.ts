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

import logger from './logger.js'

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
const CLIENT_SUBFOLDERS: string[] = ['Contrats', 'Devis', 'Factures', 'Livrables', 'Communication', 'Briefs', 'Assets']

/**
 * Sanitize a folder name to prevent path traversal and invalid characters
 */
function sanitizeFolderName(name: string): string {
  if (!name || typeof name !== 'string') return ''

  return (
    name
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
  )
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
  return `${url}/remote.php/webdav/${encodedPath}`
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
export async function createClientFolders(
  clientName: string,
  clientId: string | null = null,
): Promise<ClientFoldersResult> {
  if (!isConfigured()) {
    if (!hasLoggedWarning) {
      logger.warn(
        '[Nextcloud] Skipping folder creation — not configured. Set NEXTCLOUD_URL, NEXTCLOUD_USER, and NEXTCLOUD_APP_PASSWORD to enable.',
      )
      hasLoggedWarning = true
    }
    return { success: false, error: 'Nextcloud not configured' }
  }

  // Sanitize and validate the client name
  const sanitized = sanitizeFolderName(clientName)
  const folderName = sanitized || (clientId ? `client-${clientId}` : null)

  if (!folderName) {
    logger.error('[Nextcloud] Cannot create folders: no valid client name or ID')
    return { success: false, error: 'No valid client name' }
  }

  const { basePath: configBasePath } = getConfig()
  const basePath = configBasePath.endsWith('/') ? configBasePath.slice(0, -1) : configBasePath

  const clientPath = `${basePath}/${folderName}`
  const created: string[] = []
  const errors: string[] = []

  logger.info(`[Nextcloud] Creating folders for client: ${folderName}`)

  // First, ensure the base path exists (create parent folders)
  // Split basePath and create each level
  const baseSegments = basePath.split('/').filter(Boolean)
  let currentPath = ''
  for (const segment of baseSegments) {
    currentPath += `/${segment}`
    const result = await createFolder(currentPath)
    if (!result.success && !result.alreadyExists) {
      // Log but continue - the folder might exist
      logger.warn(`[Nextcloud] Warning creating base path ${currentPath}: ${result.error}`)
    }
  }

  // Create the client's main folder
  const mainResult = await createFolder(clientPath)
  if (mainResult.success) {
    created.push(clientPath)
    if (!mainResult.alreadyExists) {
      logger.info(`[Nextcloud] Created: ${clientPath}`)
    }
  } else {
    errors.push(`${clientPath}: ${mainResult.error}`)
    logger.error(`[Nextcloud] Failed to create ${clientPath}: ${mainResult.error}`)
  }

  // Create subfolders
  for (const subfolder of CLIENT_SUBFOLDERS) {
    const subPath = `${clientPath}/${subfolder}`
    const result = await createFolder(subPath)
    if (result.success) {
      created.push(subPath)
      if (!result.alreadyExists) {
        logger.info(`[Nextcloud] Created: ${subPath}`)
      }
    } else {
      errors.push(`${subPath}: ${result.error}`)
      logger.error(`[Nextcloud] Failed to create ${subPath}: ${result.error}`)
    }
  }

  const success = errors.length === 0
  if (success) {
    logger.info(`[Nextcloud] Successfully created folder structure for ${folderName}`)
  } else {
    logger.warn(`[Nextcloud] Completed with ${errors.length} error(s) for ${folderName}`)
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

// ─────────────────────────────────────────────
// GESTION DES COMPTES STAGIAIRES
// ─────────────────────────────────────────────

export interface InternNextcloudResult {
  success: boolean
  username?: string
  password?: string
  error?: string
}

const getAdminUser = () => process.env.NEXTCLOUD_ADMIN_USER || ''
const getAdminPass = () => process.env.NEXTCLOUD_ADMIN_PASS || ''
const getNcUrl = () => (process.env.NEXTCLOUD_URL || '').replace(/\/$/, '')

function adminAuthHeader(): string {
  return `Basic ${Buffer.from(`${getAdminUser()}:${getAdminPass()}`).toString('base64')}`
}

/** Génère un username Nextcloud à partir d'un nom : "Jean Dupont" → "jean.dupont" */
export function generateNextcloudUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.')
}

/** Génère un mot de passe aléatoire de 12 caractères */
export function generateNextcloudPassword(): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'
  const specials = '!@#$%'
  const all = lower + upper + digits + specials
  let pwd = lower[Math.floor(Math.random() * lower.length)]
  pwd += upper[Math.floor(Math.random() * upper.length)]
  pwd += digits[Math.floor(Math.random() * digits.length)]
  pwd += specials[Math.floor(Math.random() * specials.length)]
  for (let i = 4; i < 12; i++) pwd += all[Math.floor(Math.random() * all.length)]
  return pwd
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('')
}

async function createNcUser(
  username: string,
  password: string,
  email: string,
  displayName: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = new URLSearchParams({ userid: username, password, email, displayName })
  try {
    const res = await fetch(`${getNcUrl()}/ocs/v1.php/cloud/users?format=json`, {
      method: 'POST',
      headers: {
        Authorization: adminAuthHeader(),
        'OCS-APIRequest': 'true',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    const data = (await res.json()) as any
    if (data?.ocs?.meta?.statuscode === 100) return { ok: true }
    return { ok: false, error: data?.ocs?.meta?.message || 'Erreur Nextcloud' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

async function createInternFolders(username: string, password: string): Promise<void> {
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  await new Promise((r) => setTimeout(r, 1500)) // attendre init du home directory
  for (const folder of ['Documents', 'Livrables', 'Briefs']) {
    await fetch(`${getNcUrl()}/remote.php/dav/files/${username}/${folder}`, {
      method: 'MKCOL',
      headers: { Authorization: auth },
    }).catch(() => {})
  }
}

/**
 * Crée un compte Nextcloud pour un stagiaire + sa structure de dossiers.
 * Retourne le username et le mot de passe générés.
 */
export async function provisionNextcloudIntern(name: string, email: string): Promise<InternNextcloudResult> {
  if (!getAdminUser() || !getAdminPass()) {
    return { success: false, error: 'NEXTCLOUD_ADMIN_USER / NEXTCLOUD_ADMIN_PASS non configurés' }
  }

  let username = generateNextcloudUsername(name)
  const password = generateNextcloudPassword()

  let result = await createNcUser(username, password, email, name)

  // Si le username est déjà pris, ajouter un suffixe
  if (!result.ok && result.error?.toLowerCase().includes('already')) {
    username = `${username}.${Date.now().toString().slice(-4)}`
    result = await createNcUser(username, password, email, name)
  }

  if (!result.ok) return { success: false, error: result.error }

  await createInternFolders(username, password)
  return { success: true, username, password }
}

/** Supprime un compte Nextcloud stagiaire */
export async function deleteNextcloudUser(username: string): Promise<void> {
  if (!getAdminUser() || !getAdminPass() || !username) return
  await fetch(`${getNcUrl()}/ocs/v1.php/cloud/users/${encodeURIComponent(username)}?format=json`, {
    method: 'DELETE',
    headers: { Authorization: adminAuthHeader(), 'OCS-APIRequest': 'true' },
  }).catch(() => {})
}

// ─── Upload de fichiers vers Nextcloud ───────────────────────────────────────

export type UploadType =
  | 'taches'
  | 'projets'
  | 'tickets'
  | 'facturation'
  | 'ressources'
  | 'qualiopi'
  | 'projets-internes'
  | 'stagiaires'
  | 'rapports'
  | 'conventions'
  | 'filiales'

const UPLOAD_FOLDER_LABELS: Record<UploadType, string> = {
  taches: 'Tâches',
  projets: 'Projets',
  tickets: 'Tickets',
  facturation: 'Facturation',
  ressources: 'Ressources',
  qualiopi: 'Qualiopi',
  'projets-internes': 'Projets-Internes',
  stagiaires: 'Stagiaires',
  rapports: 'Rapports',
  conventions: 'Conventions',
  filiales: 'Filiales',
}

/**
 * Upload un fichier local vers Nextcloud via WebDAV PUT.
 * Crée les dossiers parents si besoin.
 */
export async function uploadFileToNextcloud(
  localPath: string,
  destPath: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured()) return { success: false, error: 'Nextcloud non configuré' }

  const fs = await import('fs')
  if (!fs.existsSync(localPath)) return { success: false, error: 'Fichier local introuvable' }

  // Créer les dossiers parents
  const parts = destPath.split('/')
  for (let i = 2; i < parts.length; i++) {
    await createFolder(parts.slice(0, i).join('/'))
  }

  const fileBuffer = fs.readFileSync(localPath)
  const url = buildWebDavUrl(destPath)

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: buildAuthHeader(),
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileBuffer.length),
      },
      body: fileBuffer,
    })
    if (res.status === 201 || res.status === 204 || res.status === 200) {
      return { success: true }
    }
    return { success: false, error: `HTTP ${res.status}` }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

/**
 * Synchronise un fichier uploadé vers Nextcloud. Fire-and-forget.
 * @param file   Fichier Multer (après sauvegarde locale)
 * @param type   Catégorie (taches, projets, tickets…)
 * @param id     ID optionnel (taskId, projectId…) pour sous-dossier
 */
export function syncUploadToNextcloud(
  file: { path: string; originalname: string },
  type: UploadType,
  id?: string,
): void {
  if (!isConfigured()) return

  const baseUploadPath = '/Venio/Uploads'
  const folder = UPLOAD_FOLDER_LABELS[type]
  const subPath = id ? `${baseUploadPath}/${folder}/${id}` : `${baseUploadPath}/${folder}`
  const destPath = `${subPath}/${sanitizeFolderName(file.originalname) || 'fichier'}`

  uploadFileToNextcloud(file.path, destPath)
    .then((result) => {
      if (!result.success) {
        logger.warn(`[Nextcloud] Upload échoué (${type}/${id}): ${result.error}`)
      }
    })
    .catch(() => {})
}
