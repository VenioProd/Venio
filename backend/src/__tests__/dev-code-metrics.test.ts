import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  computeProjectCodeMetrics,
  resolveRepoPath,
  invalidateCodeMetricsCache,
} from '../lib/dev/codeMetrics.js'

let tmpRoot: string
let repoDir: string

const SAVED = { root: process.env.DEV_REPO_ROOT, fallback: process.env.DEV_DEFAULT_REPO_PATH }

function writeRepo(base: string) {
  fs.mkdirSync(base, { recursive: true })
  fs.mkdirSync(path.join(base, 'src/components'), { recursive: true })
  fs.mkdirSync(path.join(base, 'src/pages'), { recursive: true })
  fs.mkdirSync(path.join(base, 'node_modules/junk'), { recursive: true })
  fs.mkdirSync(path.join(base, 'dist'), { recursive: true })
  // 50-line ts file
  fs.writeFileSync(path.join(base, 'src/components/Small.ts'), Array.from({ length: 50 }, (_, i) => `// line ${i}`).join('\n'))
  // 800-line tsx file (way over threshold 350)
  fs.writeFileSync(
    path.join(base, 'src/pages/Huge.tsx'),
    Array.from({ length: 800 }, (_, i) => `// line ${i}`).join('\n')
  )
  // 400-line css file (within threshold)
  fs.writeFileSync(
    path.join(base, 'src/components/styles.css'),
    Array.from({ length: 400 }, (_, i) => `/* line ${i} */`).join('\n')
  )
  // ignored content
  fs.writeFileSync(path.join(base, 'node_modules/junk/index.js'), 'should not be scanned')
  fs.writeFileSync(path.join(base, 'dist/bundle.js'), 'should not be scanned')
  fs.writeFileSync(path.join(base, 'package-lock.json'), '{}')
  // binary that should be ignored
  fs.writeFileSync(path.join(base, 'src/components/icon.png'), Buffer.from([0, 0, 0]))
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'venio-codemetrics-'))
  repoDir = path.join(tmpRoot, 'demoProject')
  writeRepo(repoDir)
})

afterAll(() => {
  process.env.DEV_REPO_ROOT = SAVED.root
  process.env.DEV_DEFAULT_REPO_PATH = SAVED.fallback
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

beforeEach(() => {
  invalidateCodeMetricsCache()
  delete process.env.DEV_REPO_ROOT
  delete process.env.DEV_DEFAULT_REPO_PATH
})

afterEach(() => {
  invalidateCodeMetricsCache()
})

describe('resolveRepoPath', () => {
  it('returns reason when nothing is configured', () => {
    const r = resolveRepoPath(null)
    expect(r.resolved).toBeNull()
    expect(r.reason).toMatch(/non configurées/)
  })

  it('rejects path traversal under DEV_REPO_ROOT', () => {
    process.env.DEV_REPO_ROOT = tmpRoot
    const r = resolveRepoPath({
      owner: null,
      repo: null,
      defaultBranch: null,
      htmlUrl: null,
      repoPath: '../escape',
    })
    expect(r.resolved).toBeNull()
  })

  it('resolves a valid repoPath under DEV_REPO_ROOT', () => {
    process.env.DEV_REPO_ROOT = tmpRoot
    const r = resolveRepoPath({
      owner: null,
      repo: null,
      defaultBranch: null,
      htmlUrl: null,
      repoPath: 'demoProject',
    })
    expect(r.resolved).not.toBeNull()
    expect(r.resolved).toContain('demoProject')
  })

  it('falls back to DEV_DEFAULT_REPO_PATH when no per-project path', () => {
    process.env.DEV_DEFAULT_REPO_PATH = repoDir
    const r = resolveRepoPath(null)
    expect(r.resolved).not.toBeNull()
  })
})

describe('computeProjectCodeMetrics', () => {
  it('reports unconfigured cleanly when no path resolves', () => {
    const m = computeProjectCodeMetrics(null)
    expect(m.available).toBe(false)
    expect(m.source).toBe('unconfigured')
    expect(m.totals).toEqual({ files: 0, lines: 0, bytes: 0 })
    expect(m.byExtension).toEqual([])
    expect(m.largeFiles).toEqual([])
  })

  it('counts LoC and surfaces large files when configured', () => {
    process.env.DEV_DEFAULT_REPO_PATH = repoDir
    const m = computeProjectCodeMetrics(null, { force: true })
    expect(m.available).toBe(true)
    expect(m.source).toBe('filesystem')
    // 3 source files (.ts, .tsx, .css) — png excluded, lockfile excluded.
    expect(m.totals.files).toBeGreaterThanOrEqual(3)
    const exts = m.byExtension.map((e) => e.ext)
    expect(exts).toContain('.tsx')
    expect(exts).toContain('.ts')
    expect(exts).toContain('.css')

    // The 800-line .tsx file is over threshold (350) and should be flagged.
    const huge = m.largeFiles.find((l) => l.path.endsWith('Huge.tsx'))
    expect(huge).toBeDefined()
    expect(huge!.lines).toBeGreaterThanOrEqual(800)
    expect(huge!.score).toBeGreaterThan(0)
    expect(huge!.threshold).toBe(350)
  })

  it('ignores node_modules, dist, and lockfiles', () => {
    process.env.DEV_DEFAULT_REPO_PATH = repoDir
    const m = computeProjectCodeMetrics(null, { force: true })
    expect(m.available).toBe(true)
    for (const ext of m.byExtension) {
      for (const f of ext.largestFiles) {
        expect(f.path.startsWith('node_modules/')).toBe(false)
        expect(f.path.startsWith('dist/')).toBe(false)
      }
    }
    const lockfile = m.byExtension.flatMap((e) => e.largestFiles).find((f) => f.path === 'package-lock.json')
    expect(lockfile).toBeUndefined()
  })

  it('caches subsequent calls within TTL', async () => {
    process.env.DEV_DEFAULT_REPO_PATH = repoDir
    const first = computeProjectCodeMetrics(null, { force: true })
    expect(first.scannedAt).not.toBeNull()
    const second = computeProjectCodeMetrics(null)
    expect(second.scannedAt).toBe(first.scannedAt)
    // Wait briefly so the next forced scan produces a distinct timestamp.
    await new Promise((r) => setTimeout(r, 10))
    const third = computeProjectCodeMetrics(null, { force: true })
    expect(third.scannedAt).not.toBe(first.scannedAt)
  })
})
