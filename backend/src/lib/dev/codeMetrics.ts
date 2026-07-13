import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import type { DevProjectGithubConfig } from '../../models/DevProject.js'

const execFileAsync = promisify(execFile)

export interface FileEntry {
  path: string // relative to repo root, forward-slash normalized
  ext: string // lowercased, with leading dot ('.ts'), or '' for files without ext
  lines: number
  bytes: number
  typescriptDebt?: TypeScriptDebt
  todoFixmes?: Array<Omit<TodoFixme, 'path'>>
}

/**
 * Deliberately syntax-only debt indicators. This is not a TypeScript compiler
 * diagnostic: only constructs that can be counted reliably from source text
 * are included, and the UI names that limitation.
 */
export interface TypeScriptDebt {
  explicitAny: number
  tsIgnore: number
  tsNoCheck: number
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

export interface TodoFixme {
  path: string
  line: number
  marker: 'TODO' | 'FIXME'
  text: string
}

export interface BackendRouteWithoutTest {
  path: string
  testHint: string
}

export interface CodeMetricsSummary {
  available: boolean
  source: 'filesystem' | 'unconfigured' | 'error' | 'pending'
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
  todoFixmes: TodoFixme[]
  backendRoutesWithoutTest: BackendRouteWithoutTest[]
  topFilesGlobal: Array<{ path: string; ext: string; language: string; lines: number; bytes: number }>
  typescriptDebt: TypeScriptDebt | null
  quality: RepoQualitySummary
}

export type RepoQualitySignalStatus = 'ok' | 'warn' | 'critical' | 'unavailable'

export interface RepoQualitySignal {
  id: 'large_files' | 'typescript_debt' | 'coverage' | 'vulnerabilities' | 'dormant_branches' | 'commit_frequency'
  label: string
  status: RepoQualitySignalStatus
  points: number | null
  maxPoints: number
  value: string
  action: string | null
  source: string
  checkedAt: string | null
  limitation?: string
}

export interface RepoQualitySummary {
  /**
   * Transparent score: sum(points) / sum(maxPoints of available signals).
   * Unavailable data is excluded rather than assumed healthy.
   */
  score: number | null
  scoredPoints: number
  scoredOutOf: number
  formula: string
  signals: RepoQualitySignal[]
}

// Directories never scanned — generated artefacts, vendor, version control, env, caches…
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',
  '.vercel',
  '.netlify',
  '.idea',
  '.vscode',
  '.svelte-kit',
  'out',
  'tmp',
  'temp',
  '.tmp',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  'logs',
  'public/build',
  'storybook-static',
  'fonts',
  'uploads',
])

// Files / patterns we treat as binary, lockfiles, generated. Keyed by base name or extension.
const IGNORE_FILE_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'poetry.lock',
  'Cargo.lock',
  'Gemfile.lock',
  '.DS_Store',
])

const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.icns',
  '.tiff',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.mkv',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.tgz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.psd',
  '.ai',
  '.sketch',
  '.fig',
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

function inspectTypeScriptDebt(content: string): TypeScriptDebt {
  return {
    // `any` in comments/strings may be counted too. The signal is intentionally
    // presented as a review cue, not as a compiler-quality claim.
    explicitAny: (content.match(/(?:\bas\s+any\b|:\s*any\b|<any>)/g) || []).length,
    tsIgnore: (content.match(/@ts-ignore\b/g) || []).length,
    tsNoCheck: (content.match(/@ts-nocheck\b/g) || []).length,
  }
}

function inspectTodoFixmes(content: string): Array<Omit<TodoFixme, 'path'>> {
  const markers: Array<Omit<TodoFixme, 'path'>> = []
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length && markers.length < 12; index++) {
    const line = lines[index]
    const match = /\b(TODO|FIXME)\b[:\s-]*(.*)/i.exec(line)
    if (!match) continue
    markers.push({
      line: index + 1,
      marker: match[1].toUpperCase() as TodoFixme['marker'],
      text: (match[2].trim() || line.trim()).slice(0, 180),
    })
  }
  return markers
}

function countLines(
  filePath: string,
  byteLimit: number,
  inspectTypescript: boolean,
): {
  lines: number
  bytes: number
  approx: boolean
  typescriptDebt?: TypeScriptDebt
  todoFixmes?: Array<Omit<TodoFixme, 'path'>>
} {
  let stat: fs.Stats
  try {
    stat = fs.statSync(filePath)
  } catch {
    return { lines: 0, bytes: 0, approx: false }
  }
  if (stat.size === 0)
    return {
      lines: 0,
      bytes: 0,
      approx: false,
      ...(inspectTypescript ? { typescriptDebt: { explicitAny: 0, tsIgnore: 0, tsNoCheck: 0 } } : {}),
    }
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
    const content = buf.toString('utf8')
    return {
      lines: n,
      bytes: stat.size,
      approx: false,
      ...(inspectTypescript ? { typescriptDebt: inspectTypeScriptDebt(content) } : {}),
      todoFixmes: inspectTodoFixmes(content),
    }
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
      const counted = countLines(abs, opts.maxBytesPerFile, ext === '.ts' || ext === '.tsx')
      files.push({
        path: rel,
        ext,
        lines: counted.lines,
        bytes: counted.bytes,
        typescriptDebt: counted.typescriptDebt,
        todoFixmes: counted.todoFixmes,
      })
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
  todoFixmes: TodoFixme[]
  backendRoutesWithoutTest: BackendRouteWithoutTest[]
  topFilesGlobal: CodeMetricsSummary['topFilesGlobal']
  typescriptDebt: TypeScriptDebt | null
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

  const byExtension: ExtensionStat[] = [...byExt.entries()]
    .map(([ext, list]) => {
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
      ratio >= 3
        ? 'Très volumineux, dépasse largement la cible.'
        : ratio >= 2
          ? 'Volumineux, devrait être découpé.'
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

  const todoFixmes = files
    .flatMap((file) =>
      (file.todoFixmes || []).map((marker) => ({
        ...marker,
        path: file.path,
      })),
    )
    .slice(0, 40)

  const hasBackendWorkspace = files.some((file) => file.path.startsWith('backend/src/'))
  const routePrefix = hasBackendWorkspace ? 'backend/src/routes/' : 'src/routes/'
  const testNames = files
    .filter((file) => /(?:^|\/)(?:__tests__|tests?|test)\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file.path))
    .map((file) => file.path.toLowerCase().replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/i, ''))
  const routeKey = (filePath: string) =>
    filePath
      .replace(routePrefix, '')
      .replace(/\.[cm]?[jt]sx?$/i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  const backendRoutesWithoutTest = files
    .filter((file) => file.path.startsWith(routePrefix) && /\.[cm]?[jt]sx?$/i.test(file.path))
    .filter((file) => {
      const key = routeKey(file.path)
      return !testNames.some((test) => test.includes(key))
    })
    .map((file) => ({
      path: file.path,
      testHint: `Aucun fichier de test dont le nom contient « ${routeKey(file.path)} » n’a été repéré.`,
    }))
    .slice(0, 20)

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

  const typescriptFiles = files.filter((file) => file.ext === '.ts' || file.ext === '.tsx')
  const typescriptDebt =
    typescriptFiles.length === 0
      ? null
      : typescriptFiles.reduce(
          (total, file) => ({
            explicitAny: total.explicitAny + (file.typescriptDebt?.explicitAny || 0),
            tsIgnore: total.tsIgnore + (file.typescriptDebt?.tsIgnore || 0),
            tsNoCheck: total.tsNoCheck + (file.typescriptDebt?.tsNoCheck || 0),
          }),
          { explicitAny: 0, tsIgnore: 0, tsNoCheck: 0 },
        )

  return {
    totals: { files: files.length, lines: totalLines, bytes: totalBytes },
    byExtension,
    largeFiles: largeFiles.slice(0, 30),
    todoFixmes,
    backendRoutesWithoutTest,
    topFilesGlobal,
    typescriptDebt,
  }
}

const QUALITY_FORMULA =
  'Score = somme des points observés / somme des maxima observés × 100. Les métriques indisponibles sont exclues.'
const LOCAL_REPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function unavailableSignal(
  id: RepoQualitySignal['id'],
  label: string,
  maxPoints: number,
  source: string,
  value: string,
): RepoQualitySignal {
  return { id, label, status: 'unavailable', points: null, maxPoints, value, action: null, source, checkedAt: null }
}

function emptyRepoQuality(reason: string): RepoQualitySummary {
  const signals: RepoQualitySignal[] = [
    unavailableSignal('large_files', 'Fichiers trop gros', 25, 'scan filesystem', reason),
    unavailableSignal('typescript_debt', 'Dette TypeScript', 20, 'scan syntaxique TypeScript', reason),
    unavailableSignal('coverage', 'Tests / coverage', 20, 'artefact coverage local', reason),
    unavailableSignal('vulnerabilities', 'Dépendances vulnérables', 20, 'rapport npm audit local', reason),
    unavailableSignal('dormant_branches', 'Branches dormantes', 8, 'git local', reason),
    unavailableSignal('commit_frequency', 'Fréquence de commits', 7, 'git local', reason),
  ]
  return { score: null, scoredPoints: 0, scoredOutOf: 0, formula: QUALITY_FORMULA, signals }
}

function scoreRepoQuality(signals: RepoQualitySignal[]): RepoQualitySummary {
  const observed = signals.filter((signal) => signal.points !== null)
  const scoredPoints = observed.reduce((total, signal) => total + (signal.points || 0), 0)
  const scoredOutOf = observed.reduce((total, signal) => total + signal.maxPoints, 0)
  return {
    score: scoredOutOf > 0 ? Math.round((scoredPoints / scoredOutOf) * 100) : null,
    scoredPoints,
    scoredOutOf,
    formula: QUALITY_FORMULA,
    signals,
  }
}

function statMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString()
  } catch {
    return null
  }
}

function localReportIsFresh(filePath: string): boolean {
  try {
    return Date.now() - fs.statSync(filePath).mtime.getTime() <= LOCAL_REPORT_MAX_AGE_MS
  } catch {
    return false
  }
}

function staleLocalReportSignal(
  id: 'coverage' | 'vulnerabilities',
  label: string,
  maxPoints: number,
  source: string,
  filePath: string,
): RepoQualitySignal {
  return {
    id,
    label,
    status: 'unavailable',
    points: null,
    maxPoints,
    value: 'Artefact local trop ancien (plus de 7 jours).',
    action: 'Rafraîchir le rapport local avant de l’utiliser.',
    source,
    checkedAt: statMtimeIso(filePath),
  }
}

function readCoverageSignal(root: string): RepoQualitySignal {
  const candidates = ['coverage/coverage-summary.json', 'coverage-summary.json']
  for (const relative of candidates) {
    const filePath = path.join(root, relative)
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { total?: { lines?: { pct?: unknown } } }
      const pct = parsed.total?.lines?.pct
      if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) continue
      if (!localReportIsFresh(filePath)) {
        return staleLocalReportSignal('coverage', 'Tests / coverage', 20, relative, filePath)
      }
      const points = pct >= 80 ? 20 : pct >= 60 ? 14 : pct >= 40 ? 8 : 0
      return {
        id: 'coverage',
        label: 'Tests / coverage',
        status: pct >= 80 ? 'ok' : pct >= 60 ? 'warn' : 'critical',
        points,
        maxPoints: 20,
        value: `${pct.toFixed(1)} % de lignes couvertes`,
        action: pct < 80 ? 'Augmenter la couverture de lignes vers 80 %.' : null,
        source: relative,
        checkedAt: statMtimeIso(filePath),
      }
    } catch {
      // A file with this conventional name but invalid content is not a source.
    }
  }
  return unavailableSignal(
    'coverage',
    'Tests / coverage',
    20,
    'coverage/coverage-summary.json',
    'Aucun artefact coverage-summary.json valide.',
  )
}

function readVulnerabilitySignal(root: string): RepoQualitySignal {
  // These are explicit local report locations. We never launch `npm audit` from
  // a request or silently infer vulnerability data from a lockfile.
  const candidates = ['.venio/npm-audit.json', 'reports/npm-audit.json']
  for (const relative of candidates) {
    const filePath = path.join(root, relative)
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        metadata?: {
          vulnerabilities?: Partial<Record<'info' | 'low' | 'moderate' | 'high' | 'critical' | 'total', unknown>>
        }
      }
      const vuln = parsed.metadata?.vulnerabilities
      const total = Number(vuln?.total)
      const high = Number(vuln?.high || 0)
      const critical = Number(vuln?.critical || 0)
      if (!Number.isFinite(total) || total < 0 || !Number.isFinite(high) || !Number.isFinite(critical)) continue
      if (!localReportIsFresh(filePath)) {
        return staleLocalReportSignal('vulnerabilities', 'Dépendances vulnérables', 20, relative, filePath)
      }
      const points = critical > 0 ? 0 : high > 0 ? 5 : total > 0 ? 12 : 20
      return {
        id: 'vulnerabilities',
        label: 'Dépendances vulnérables',
        status: critical > 0 ? 'critical' : high > 0 || total > 0 ? 'warn' : 'ok',
        points,
        maxPoints: 20,
        value: `${total} vulnérabilité(s), dont ${critical} critique(s) et ${high} haute(s)`,
        action: total > 0 ? 'Traiter les vulnérabilités critiques et hautes du rapport.' : null,
        source: relative,
        checkedAt: statMtimeIso(filePath),
      }
    } catch {
      // Same rule as coverage: malformed data is unavailable, never guessed.
    }
  }
  return unavailableSignal(
    'vulnerabilities',
    'Dépendances vulnérables',
    20,
    '.venio/npm-audit.json',
    'Aucun rapport npm audit local valide.',
  )
}

async function runGit(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: root, timeout: 5000, maxBuffer: 512 * 1024 })
    return stdout.trim()
  } catch {
    return null
  }
}

async function readGitSignals(
  root: string,
  defaultBranch: string | null | undefined,
): Promise<[RepoQualitySignal, RepoQualitySignal]> {
  const [branchesRaw, commitsRaw] = await Promise.all([
    runGit(root, ['for-each-ref', 'refs/heads', '--format=%(refname:short)%00%(committerdate:unix)']),
    runGit(root, ['rev-list', '--count', '--since=30.days', 'HEAD']),
  ])
  const branch = defaultBranch?.trim() || null
  let branches: RepoQualitySignal
  if (branchesRaw === null) {
    branches = unavailableSignal(
      'dormant_branches',
      'Branches dormantes',
      8,
      'git local',
      'Dépôt git local indisponible.',
    )
  } else {
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
    const dormant = branchesRaw
      .split('\n')
      .map((line) => line.split('\u0000'))
      .filter(([name, timestamp]) => Boolean(name) && name !== branch && Number(timestamp) < cutoff)
    const points = dormant.length === 0 ? 8 : dormant.length <= 2 ? 4 : 0
    branches = {
      id: 'dormant_branches',
      label: 'Branches dormantes',
      status: dormant.length === 0 ? 'ok' : dormant.length <= 2 ? 'warn' : 'critical',
      points,
      maxPoints: 8,
      value: `${dormant.length} branche(s) locale(s) inactive(s) depuis plus de 30 j`,
      action: dormant.length ? 'Vérifier puis fusionner ou supprimer les branches locales dormantes.' : null,
      source: 'git for-each-ref (branches locales)',
      checkedAt: new Date().toISOString(),
      limitation: 'Branches distantes et statut de merge non analysés.',
    }
  }
  let commits: RepoQualitySignal
  if (commitsRaw === null || !/^\d+$/.test(commitsRaw)) {
    commits = unavailableSignal(
      'commit_frequency',
      'Fréquence de commits',
      7,
      'git local',
      'Historique git local indisponible.',
    )
  } else {
    const count = Number(commitsRaw)
    const points = count >= 8 ? 7 : count >= 3 ? 4 : count >= 1 ? 2 : 0
    commits = {
      id: 'commit_frequency',
      label: 'Fréquence de commits',
      status: count >= 3 ? 'ok' : count >= 1 ? 'warn' : 'critical',
      points,
      maxPoints: 7,
      value: `${count} commit(s) sur les 30 derniers jours`,
      action: count < 3 ? 'Confirmer l’activité du projet ou mettre à jour son statut.' : null,
      source: 'git rev-list (HEAD local)',
      checkedAt: new Date().toISOString(),
      limitation: 'Mesure l’historique local disponible, pas l’activité distante.',
    }
  }
  return [branches, commits]
}

async function buildRepoQuality(
  root: string,
  code: Pick<CodeMetricsSummary, 'largeFiles' | 'typescriptDebt'>,
  defaultBranch: string | null | undefined,
): Promise<RepoQualitySummary> {
  const tsDebt = code.typescriptDebt
  const largeCount = code.largeFiles.length
  const largestScore = code.largeFiles[0]?.score || 0
  const largeFiles: RepoQualitySignal = {
    id: 'large_files',
    label: 'Fichiers trop gros',
    status: largestScore >= 66 ? 'critical' : largeCount > 0 ? 'warn' : 'ok',
    points: largestScore >= 66 ? 0 : largeCount > 0 ? 12 : 25,
    maxPoints: 25,
    value: `${largeCount} fichier(s) au-dessus des seuils par langage`,
    action: largeCount ? 'Découper en priorité les fichiers les plus volumineux.' : null,
    source: 'scan filesystem (seuils par extension)',
    checkedAt: new Date().toISOString(),
  }
  const typescript =
    tsDebt === null
      ? unavailableSignal(
          'typescript_debt',
          'Dette TypeScript',
          20,
          'scan syntaxique TypeScript',
          'Aucun fichier .ts ou .tsx analysé.',
        )
      : {
          id: 'typescript_debt' as const,
          label: 'Dette TypeScript',
          status:
            tsDebt.tsIgnore + tsDebt.tsNoCheck > 0
              ? ('critical' as const)
              : tsDebt.explicitAny > 10
                ? ('warn' as const)
                : ('ok' as const),
          points: tsDebt.tsIgnore + tsDebt.tsNoCheck > 0 ? 0 : tsDebt.explicitAny > 10 ? 10 : 20,
          maxPoints: 20,
          value: `${tsDebt.explicitAny} any explicite(s) · ${tsDebt.tsIgnore} @ts-ignore · ${tsDebt.tsNoCheck} @ts-nocheck`,
          action:
            tsDebt.tsIgnore + tsDebt.tsNoCheck > 0
              ? 'Supprimer les contournements TypeScript avant d’ajouter de nouvelles exceptions.'
              : tsDebt.explicitAny > 10
                ? 'Réduire les any explicites dans les zones les plus touchées.'
                : null,
          source: 'scan syntaxique .ts/.tsx',
          checkedAt: new Date().toISOString(),
          limitation: 'Comptage lexical : ce n’est ni un typecheck ni une mesure de bugs.',
        }
  const gitSignals = readGitSignals(root, defaultBranch)
  const [coverage, vulnerabilities, [dormantBranches, commitFrequency]] = await Promise.all([
    Promise.resolve(readCoverageSignal(root)),
    Promise.resolve(readVulnerabilitySignal(root)),
    gitSignals,
  ])
  return scoreRepoQuality([largeFiles, typescript, coverage, vulnerabilities, dormantBranches, commitFrequency])
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
        if (!stat.isDirectory()) return { resolved: null, reason: "repoPath n'est pas un dossier." }
        return { resolved: real, reason: null }
      } catch {
        return { resolved: null, reason: 'repoPath introuvable sur le serveur.' }
      }
    }
    if (fallback) {
      try {
        const real = fs.realpathSync(fallback)
        if (fs.statSync(real).isDirectory()) return { resolved: real, reason: null }
      } catch {
        /* fall through */
      }
    }
    return { resolved: null, reason: 'Aucun repoPath renseigné pour ce projet.' }
  }

  if (fallback) {
    try {
      const real = fs.realpathSync(fallback)
      if (fs.statSync(real).isDirectory()) return { resolved: real, reason: null }
    } catch {
      /* ignore */
    }
  }

  return {
    resolved: null,
    reason:
      'Métriques code non configurées : définissez DEV_REPO_ROOT (et un repoPath sur le projet) ou DEV_DEFAULT_REPO_PATH côté backend.',
  }
}

// In-memory cache keyed by resolved repository. Routes read this snapshot only;
// the scheduler below owns refreshes so a dashboard request never starts a scan.
const CACHE_TTL_MS = 10 * 60_000
interface CacheEntry {
  at: number
  payload: CodeMetricsSummary
}
const cache = new Map<string, CacheEntry>()
const refreshes = new Map<string, Promise<void>>()

export function invalidateCodeMetricsCache(resolvedPath?: string): void {
  if (resolvedPath) cache.delete(resolvedPath)
  else cache.clear()
}

export interface ComputeOptions {
  force?: boolean
  // Override scan limits — used by tests primarily.
  limits?: Partial<ScanOptions>
}

function unavailableCodeMetrics(
  source: CodeMetricsSummary['source'],
  reason: string,
  resolvedPath: string | null = null,
): CodeMetricsSummary {
  return {
    available: false,
    source,
    resolvedPath,
    scannedAt: null,
    durationMs: null,
    reason,
    totals: { files: 0, lines: 0, bytes: 0 },
    byExtension: [],
    largeFiles: [],
    todoFixmes: [],
    backendRoutesWithoutTest: [],
    topFilesGlobal: [],
    typescriptDebt: null,
    quality: emptyRepoQuality(reason),
  }
}

export function computeProjectCodeMetrics(
  github: DevProjectGithubConfig | null | undefined,
  opts: ComputeOptions = {},
): CodeMetricsSummary {
  const { resolved, reason } = resolveRepoPath(github)
  if (!resolved) {
    return unavailableCodeMetrics('unconfigured', reason || 'Métriques non disponibles.')
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
    const { totals, byExtension, largeFiles, todoFixmes, backendRoutesWithoutTest, topFilesGlobal, typescriptDebt } = aggregate(files)
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
      todoFixmes,
      backendRoutesWithoutTest,
      topFilesGlobal,
      typescriptDebt,
      quality: emptyRepoQuality('Collecte qualité en attente.'),
    }
    cache.set(resolved, { at: Date.now(), payload })
    return payload
  } catch (err) {
    return unavailableCodeMetrics('error', (err as Error).message, resolved)
  }
}

/** Return the last periodic snapshot without scanning from an HTTP request. */
export function getCachedProjectCodeMetrics(github: DevProjectGithubConfig | null | undefined): CodeMetricsSummary {
  const { resolved, reason } = resolveRepoPath(github)
  if (!resolved) return unavailableCodeMetrics('unconfigured', reason || 'Métriques non disponibles.')
  const cached = cache.get(resolved)
  if (cached) return cached.payload
  return unavailableCodeMetrics(
    'pending',
    'Collecte repo en attente du prochain rafraîchissement périodique.',
    resolved,
  )
}

/**
 * Refresh a repository snapshot outside the request path. Calls for the same
 * repository coalesce so a manual refresh cannot start overlapping scans.
 */
export function refreshProjectCodeMetrics(
  github: DevProjectGithubConfig | null | undefined,
  opts: ComputeOptions = {},
): Promise<void> {
  const { resolved } = resolveRepoPath(github)
  if (!resolved) return Promise.resolve()
  const inFlight = refreshes.get(resolved)
  if (inFlight) return inFlight
  const task = Promise.resolve()
    .then(async () => {
      const code = computeProjectCodeMetrics(github, { ...opts, force: true })
      if (!code.available || !code.resolvedPath) return
      code.quality = await buildRepoQuality(code.resolvedPath, code, github?.defaultBranch)
      cache.set(code.resolvedPath, { at: Date.now(), payload: code })
    })
    .finally(() => {
      refreshes.delete(resolved)
    })
  refreshes.set(resolved, task)
  return task
}
