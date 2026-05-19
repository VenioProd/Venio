import fs from 'fs'
import path from 'path'
import type { DevProjectGithubConfig } from '../../models/DevProject.js'

export interface FileEntry {
  path: string // relative to repo root, forward-slash normalized
  ext: string  // lowercased, with leading dot ('.ts'), or '' for files without ext
  lines: number
  bytes: number
}

export interface ExtensionStat {
  ext: string
  language: string
  files: number
  lines: number
  bytes: number
  largestFiles: Array<{ path: string; lines: number; bytes: number }>
}

export interface LargeFile {
  path: string
  ext: string
  language: string
  lines: number
  threshold: number
  // 0..100 — higher means more urgent to refactor
  score: number
  reason: string
}

export interface CodeMetricsSummary {
  available: boolean
  source: 'filesystem' | 'unconfigured' | 'error'
  resolvedPath: string | null
  scannedAt: string | null
  durationMs: number | null
  reason?: string
  totals: {
    files: number
    lines: number
    bytes: number
  }
  byExtension: ExtensionStat[]
  largeFiles: LargeFile[]
  topFilesGlobal: Array<{ path: string; ext: string; language: string; lines: number; bytes: number }>
}

// Directories never scanned — generated artefacts, vendor, version control, env, caches…
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.nuxt', '.cache', '.parcel-cache',
  '.turbo', '.vercel', '.netlify', '.idea', '.vscode', '.svelte-kit', 'out', 'tmp', 'temp', '.tmp',
  '__pycache__', '.pytest_cache', 'venv', '.venv', 'env', 'logs', 'public/build',
  'storybook-static', 'design-backup', 'fonts', 'uploads',
])

// Files / patterns we treat as binary, lockfiles, generated. Keyed by base name or extension.
const IGNORE_FILE_NAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'poetry.lock',
  'Cargo.lock', 'Gemfile.lock', '.DS_Store',
])

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.tiff', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.webm', '.avi', '.mkv',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.psd', '.ai', '.sketch', '.fig',
])

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (TSX)',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (JSX)',
  '.mjs': 'JavaScript (ESM)',
  '.cjs': 'JavaScript (CJS)',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.html': 'HTML',
  '.json': 'JSON',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.sql': 'SQL',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
}

// Thresholds tuned for the Venio codebase. TS/TSX > 350 LoC usually means the
// component or route has accreted concerns and is a good refactor candidate.
const REFRACTOR_THRESHOLDS: Record<string, number> = {
  '.ts': 400,
  '.tsx': 350,
  '.js': 400,
  '.jsx': 350,
  '.mjs': 400,
  '.cjs': 400,
  '.css': 500,
  '.scss': 500,
  '.less': 500,
  '.html': 500,
  '.json': 1500, // tolerated, JSON tends to be data dumps
  '.md': 1200,
  '.py': 500,
  '.go': 500,
  '.java': 600,
  '.rb': 500,
  '.php': 600,
  '.sql': 800,
  '.vue': 350,
  '.svelte': 350,
}

const DEFAULT_THRESHOLD = 600

const GENERATED_HINTS: RegExp[] = [
  /\.generated\./i,
  /generated\.[a-z]+$/i,
  /\.gen\.[a-z]+$/i,
  /-snapshot\./i,
  /__generated__/i,
  /openapi\.(json|yaml|yml)$/i,
]

function language(ext: string): string {
  return LANGUAGE_BY_EXT[ext] || (ext ? ext.replace('.', '').toUpperCase() : 'Sans extension')
}

function looksGenerated(rel: string): boolean {
  return GENERATED_HINTS.some((r) => r.test(rel))
}

interface ScanOptions {
  // Maximum files visited overall — guards against runaway scans on very large repos.
  maxFiles: number
  // Maximum bytes read per file when counting lines — files larger than this are
  // approximated via byte size / avg-line-length to avoid blocking on huge JSON/SVG.
  maxBytesPerFile: number
  // Maximum total wall-clock allowed before bailing out (ms).
  maxScanMs: number
}

const DEFAULT_OPTS: ScanOptions = {
  maxFiles: 8000,
  maxBytesPerFile: 2_000_000, // 2 MB
  maxScanMs: 8000,
}

function shouldIgnoreDir(name: string): boolean {
  if (IGNORE_DIRS.has(name)) return true
  if (name.startsWith('.')) return ['.husky', '.github', '.changeset'].indexOf(name) === -1
  return false
}

function isBinary(ext: string): boolean {
  return BINARY_EXTS.has(ext)
}

function countLines(filePath: string, byteLimit: number): { lines: number; bytes: number; approx: boolean } {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return { lines: 0, bytes: 0, approx: false }
  }
  if (stat.size === 0) return { lines: 0, bytes: 0, approx: false }
  if (stat.size > byteLimit) {
    // Approximate: average line ~64 bytes works for typical source.
    return { lines: Math.round(stat.size / 64), bytes: stat.size, approx: true }
  }
  try {
    const buf = fs.readFileSync(filePath)
    let n = 0
    for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++
    // Count the trailing partial line if file doesn't end with \n
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) n++
    return { lines: n, bytes: stat.size, approx: false }
  } catch {
    return { lines: 0, bytes: stat.size, approx: false }
  }
}

interface ScanResult {
  files: FileEntry[]
  durationMs: number
  truncated: boolean
}

function scanFs(root: string, opts: ScanOptions): ScanResult {
  const start = Date.now()
  const files: FileEntry[] = []
  let truncated = false

  const stack: string[] = [root]
  while (stack.length) {
    if (Date.now() - start > opts.maxScanMs) {
      truncated = true
      break
    }
    const dir = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name)) continue
        stack.push(abs)
        continue
      }
      if (!entry.isFile()) continue
      if (IGNORE_FILE_NAMES.has(entry.name)) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (isBinary(ext)) continue
      const rel = path.relative(root, abs).split(path.sep).join('/')
      if (files.length >= opts.maxFiles) {
        truncated = true
        break
      }
      const counted = countLines(abs, opts.maxBytesPerFile)
      files.push({ path: rel, ext, lines: counted.lines, bytes: counted.bytes })
    }
    if (files.length >= opts.maxFiles) {
      truncated = true
      break
    }
  }

  return { files, durationMs: Date.now() - start, truncated }
}

function aggregate(files: FileEntry[]): {
  totals: CodeMetricsSummary['totals']
  byExtension: ExtensionStat[]
  largeFiles: LargeFile[]
  topFilesGlobal: CodeMetricsSummary['topFilesGlobal']
} {
  const byExt = new Map<string, FileEntry[]>()
  let totalLines = 0
  let totalBytes = 0
  for (const f of files) {
    totalLines += f.lines
    totalBytes += f.bytes
    const key = f.ext || '(aucune)'
    if (!byExt.has(key)) byExt.set(key, [])
    byExt.get(key)!.push(f)
  }

  const byExtension: ExtensionStat[] = [...byExt.entries()].map(([ext, list]) => {
    const lines = list.reduce((s, f) => s + f.lines, 0)
    const bytes = list.reduce((s, f) => s + f.bytes, 0)
    const largestFiles = [...list]
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 5)
      .map((f) => ({ path: f.path, lines: f.lines, bytes: f.bytes }))
    return {
      ext,
      language: language(ext),
      files: list.length,
      lines,
      bytes,
      largestFiles,
    }
  })
    .sort((a, b) => b.lines - a.lines)

  // Large files needing refactor — apply per-ext thresholds, compute criticality.
  const largeFiles: LargeFile[] = []
  for (const f of files) {
    if (!f.ext) continue
    const threshold = REFRACTOR_THRESHOLDS[f.ext] ?? DEFAULT_THRESHOLD
    if (f.lines < threshold) continue
    if (looksGenerated(f.path)) continue
    // Score: 0 at threshold, 100 at 4x threshold.
    const ratio = f.lines / threshold
    const score = Math.min(100, Math.round(((ratio - 1) / 3) * 100))
    const reason =
      ratio >= 3 ? 'Très volumineux, dépasse largement la cible.'
      : ratio >= 2 ? 'Volumineux, devrait être découpé.'
      : 'Au-dessus du seuil, candidat à un refactor.'
    largeFiles.push({
      path: f.path,
      ext: f.ext,
      language: language(f.ext),
      lines: f.lines,
      threshold,
      score: Math.max(score, 5),
      reason,
    })
  }
  largeFiles.sort((a, b) => b.score - a.score || b.lines - a.lines)

  const topFilesGlobal = [...files]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 8)
    .map((f) => ({
      path: f.path,
      ext: f.ext,
      language: language(f.ext),
      lines: f.lines,
      bytes: f.bytes,
    }))

  return {
    totals: { files: files.length, lines: totalLines, bytes: totalBytes },
    byExtension,
    largeFiles: largeFiles.slice(0, 30),
    topFilesGlobal,
  }
}

/**
 * Resolve the filesystem path to scan for a given project.
 *
 * The scanner is opt-in and safe by construction:
 *  - DEV_REPO_ROOT (env): a directory containing repositories; project.github.repoPath
 *    is a subdirectory under it. Path traversal escaping the root is rejected.
 *  - DEV_DEFAULT_REPO_PATH (env): single-repo fallback when DEV_REPO_ROOT isn't set
 *    and the project has no per-project path. Useful for the Venio app pointing at itself.
 *
 * Returns null when nothing is configured — callers expose this as 'unconfigured'.
 */
export function resolveRepoPath(github: DevProjectGithubConfig | null | undefined): {
  resolved: string | null
  reason: string | null
} {
  const root = process.env.DEV_REPO_ROOT
  const fallback = process.env.DEV_DEFAULT_REPO_PATH
  const sub = github?.repoPath?.trim() || ''

  if (root) {
    let rootResolved: string
    try {
      rootResolved = fs.realpathSync(root)
    } catch {
      return { resolved: null, reason: `DEV_REPO_ROOT (${root}) introuvable sur le serveur.` }
    }
    if (sub) {
      const candidate = path.resolve(rootResolved, sub)
      if (candidate !== rootResolved && !candidate.startsWith(rootResolved + path.sep)) {
        return { resolved: null, reason: 'repoPath sort de DEV_REPO_ROOT (refusé).' }
      }
      try {
        const real = fs.realpathSync(candidate)
        if (real !== rootResolved && !real.startsWith(rootResolved + path.sep)) {
          return { resolved: null, reason: 'repoPath cible un lien sortant de DEV_REPO_ROOT (refusé).' }
        }
        const stat = fs.statSync(real)
        if (!stat.isDirectory()) return { resolved: null, reason: 'repoPath n\'est pas un dossier.' }
        return { resolved: real, reason: null }
      } catch {
        return { resolved: null, reason: 'repoPath introuvable sur le serveur.' }
      }
    }
    if (fallback) {
      try {
        const real = fs.realpathSync(fallback)
        if (fs.statSync(real).isDirectory()) return { resolved: real, reason: null }
      } catch {/* fall through */}
    }
    return { resolved: null, reason: 'Aucun repoPath renseigné pour ce projet.' }
  }

  if (fallback) {
    try {
      const real = fs.realpathSync(fallback)
      if (fs.statSync(real).isDirectory()) return { resolved: real, reason: null }
    } catch {/* ignore */}
  }

  return {
    resolved: null,
    reason:
      'Métriques code non configurées : définissez DEV_REPO_ROOT (et un repoPath sur le projet) ou DEV_DEFAULT_REPO_PATH côté backend.',
  }
}

// In-memory cache keyed by (resolved path). TTL kept short so the UI feels alive.
const CACHE_TTL_MS = 60_000
interface CacheEntry {
  at: number
  payload: CodeMetricsSummary
}
const cache = new Map<string, CacheEntry>()

export function invalidateCodeMetricsCache(resolvedPath?: string): void {
  if (resolvedPath) cache.delete(resolvedPath)
  else cache.clear()
}

export interface ComputeOptions {
  force?: boolean
  // Override scan limits — used by tests primarily.
  limits?: Partial<ScanOptions>
}

export function computeProjectCodeMetrics(
  github: DevProjectGithubConfig | null | undefined,
  opts: ComputeOptions = {}
): CodeMetricsSummary {
  const { resolved, reason } = resolveRepoPath(github)
  if (!resolved) {
    return {
      available: false,
      source: 'unconfigured',
      resolvedPath: null,
      scannedAt: null,
      durationMs: null,
      reason: reason || 'Métriques non disponibles.',
      totals: { files: 0, lines: 0, bytes: 0 },
      byExtension: [],
      largeFiles: [],
      topFilesGlobal: [],
    }
  }

  if (!opts.force) {
    const cached = cache.get(resolved)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.payload
    }
  }

  const scanOpts = { ...DEFAULT_OPTS, ...(opts.limits || {}) }
  try {
    const { files, durationMs, truncated } = scanFs(resolved, scanOpts)
    const { totals, byExtension, largeFiles, topFilesGlobal } = aggregate(files)
    const payload: CodeMetricsSummary = {
      available: true,
      source: 'filesystem',
      resolvedPath: resolved,
      scannedAt: new Date().toISOString(),
      durationMs,
      reason: truncated ? 'Scan partiel : limites de temps/fichiers atteintes.' : undefined,
      totals,
      byExtension,
      largeFiles,
      topFilesGlobal,
    }
    cache.set(resolved, { at: Date.now(), payload })
    return payload
  } catch (err) {
    return {
      available: false,
      source: 'error',
      resolvedPath: resolved,
      scannedAt: new Date().toISOString(),
      durationMs: null,
      reason: (err as Error).message,
      totals: { files: 0, lines: 0, bytes: 0 },
      byExtension: [],
      largeFiles: [],
      topFilesGlobal: [],
    }
  }
}
