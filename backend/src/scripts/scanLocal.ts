/**
 * Scan des projets locaux → fiches Filiales.
 * Parcourt un dossier (ex: ~/Dev), et pour chaque projet remplit la fiche via l'API admin :
 *   - description / tagline depuis le README
 *   - « Local · Lancer » (scripts npm), « Local · Stack », « Local · Services » (déduits du .env),
 *     « Local · Chemin », « Local · Statut »
 *
 * SÉCURITÉ : ne lit JAMAIS les valeurs des .env — uniquement les NOMS de variables,
 * pour en déduire les services requis. Aucune donnée secrète n'est transmise.
 *
 *   VENIO_API_BASE=http://localhost:3000 VENIO_TOKEN=<jwt> \
 *   SCAN_DIR=$HOME/Dev npx tsx src/scripts/scanLocal.ts
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const API = process.env.VENIO_API_BASE || 'http://localhost:3000'
const TOKEN = process.env.VENIO_TOKEN || ''
const BASE = process.env.SCAN_DIR || path.join(os.homedir(), 'Dev')
if (!TOKEN) throw new Error('VENIO_TOKEN (JWT super-admin) requis')

const LOCAL_PREFIX = 'Local · '
// Dossiers à ignorer (holding, gabarits, bacs à sable, site perso…)
const DENYLIST = new Set(['venio', '_template', 'jeux', 'raphaelbentv', 'apps', 'test dev', 'avancement projets'])
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

async function api<T>(p: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`API ${init?.method || 'GET'} ${p} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

function repoNameFromGit(dir: string, fallback: string): string {
  try {
    const url = execSync('git remote get-url origin', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    const m = url.match(/([^/]+?)(\.git)?$/)
    return m ? m[1] : fallback
  } catch {
    return fallback
  }
}

function readReadme(dir: string): { description: string; status: string } {
  const f = fs.readdirSync(dir).find((x) => /^readme(\.md|\.txt)?$/i.test(x))
  if (!f) return { description: '', status: '' }
  const raw = fs.readFileSync(path.join(dir, f), 'utf8')
  const lines = raw.split('\n')
  let status = ''
  const out: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^!\[/.test(t) || /^<.*>$/.test(t) || /^\|?\s*[-:]+\s*\|/.test(t)) continue // badges, html, séparateurs de table
    if (/statut/i.test(t) && !status)
      status = t
        .replace(/[*_>#`]/g, '')
        .replace(/^.*statut\s*:?\s*/i, '')
        .trim()
    const clean = t
      .replace(/^#+\s*/, '')
      .replace(/^>\s*/, '')
      .replace(/[*_`]/g, '')
      .trim()
    if (clean) out.push(clean)
    if (out.join(' ').length > 600) break
  }
  // on saute le titre seul s'il est redondant
  return { description: out.slice(0, 8).join('\n'), status: status.slice(0, 80) }
}

const STACK_KEYWORDS = [
  'next',
  'react',
  'vue',
  'svelte',
  'astro',
  'express',
  'fastify',
  'nest',
  'prisma',
  'drizzle',
  'mongoose',
  'supabase',
  'stripe',
  'tailwind',
  'vite',
  'trpc',
  'clerk',
  'ioredis',
  'redis',
  'socket.io',
  'three',
  'electron',
]
function readPackage(dir: string): { scripts: string; stack: string; monorepo: boolean } {
  const p = path.join(dir, 'package.json')
  if (!fs.existsSync(p)) return { scripts: '', stack: '', monorepo: false }
  try {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'))
    const scripts = Object.keys(pkg.scripts || {})
    const runners = scripts.filter((s) => ['dev', 'start', 'build', 'worker'].includes(s)).map((s) => `npm run ${s}`)
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    const stack = Object.keys(deps)
      .filter((d) => STACK_KEYWORDS.some((k) => d.toLowerCase().includes(k)))
      .map((d) => d.replace(/^@[^/]+\//, ''))
    return {
      scripts: runners.slice(0, 4).join(' · '),
      stack: [...new Set(stack)].slice(0, 12).join(', '),
      monorepo: Boolean(pkg.workspaces),
    }
  } catch {
    return { scripts: '', stack: '', monorepo: false }
  }
}

/** Lit UNIQUEMENT les noms de variables d'un .env (jamais les valeurs). */
function readEnvKeys(dir: string): string[] {
  const candidates = ['.env.example', '.env.sample', '.env.template', '.env']
  for (const c of candidates) {
    const p = path.join(dir, c)
    if (!fs.existsSync(p)) continue
    return [
      ...new Set(
        fs
          .readFileSync(p, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split('=')[0].trim())
          .filter((k) => /^[A-Z0-9_]+$/.test(k)),
      ),
    ]
  }
  return []
}

function inferServices(keys: string[]): string {
  const has = (re: RegExp) => keys.some((k) => re.test(k))
  const s: string[] = []
  if (has(/DATABASE_URL|POSTGRES|PGHOST|DB_/)) s.push('Base de données')
  if (has(/REDIS/)) s.push('Redis')
  if (has(/STRIPE/)) s.push('Stripe')
  if (has(/SUPABASE/)) s.push('Supabase')
  if (has(/AUTH|CLERK|NEXTAUTH|JWT/)) s.push('Auth')
  if (has(/SMTP|RESEND|SENDGRID|MAIL/)) s.push('Email')
  if (has(/OPENAI|ANTHROPIC|MISTRAL|GROQ/)) s.push('IA / LLM')
  if (has(/AWS|S3|CLOUDINARY|BLOB/)) s.push('Stockage')
  return s.join(', ')
}

function mergeInfos(existing: any[] = [], local: { label: string; value: string }[]) {
  const kept = (existing || []).filter((i) => !String(i.label).startsWith(LOCAL_PREFIX))
  return [...kept, ...local.filter((i) => i.value)]
}

async function run() {
  const { subsidiaries } = await api<{ subsidiaries: any[] }>('/api/admin/subsidiaries?archived=true')
  const byName = new Map<string, any>(subsidiaries.map((s) => [s.name.toLowerCase(), s]))

  const entries = fs.readdirSync(BASE, { withFileTypes: true }).filter((e) => e.isDirectory())
  let created = 0
  let updated = 0
  for (const e of entries) {
    if (DENYLIST.has(e.name.toLowerCase())) continue
    const dir = path.join(BASE, e.name)
    const hasReadme = fs.readdirSync(dir).some((x) => /^readme/i.test(x))
    const hasPkg = fs.existsSync(path.join(dir, 'package.json'))
    if (!hasReadme && !hasPkg) continue // pas un projet exploitable

    const repoName = repoNameFromGit(dir, e.name)
    const name = titleCase(repoName)
    const readme = readReadme(dir)
    const pkg = readPackage(dir)
    const envKeys = readEnvKeys(dir)
    const services = inferServices(envKeys)

    const localInfos = [
      { label: `${LOCAL_PREFIX}Chemin`, value: dir.replace(os.homedir(), '~') },
      { label: `${LOCAL_PREFIX}Lancer`, value: pkg.scripts },
      {
        label: `${LOCAL_PREFIX}Stack`,
        value: pkg.stack + (pkg.monorepo ? (pkg.stack ? ' · monorepo' : 'monorepo') : ''),
      },
      { label: `${LOCAL_PREFIX}Services`, value: services },
      { label: `${LOCAL_PREFIX}Statut`, value: readme.status },
    ]

    try {
      const existing = byName.get(name.toLowerCase())
      const payload: Record<string, unknown> = {
        name,
        infos: mergeInfos(existing?.infos, localInfos),
        productDescription: existing?.productDescription || readme.description,
        description: existing?.description || readme.description.split('\n')[0] || '',
      }
      if (existing) {
        await api(`/api/admin/subsidiaries/${existing._id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        updated++
        console.log(`↻ ${name}`)
      } else {
        await api('/api/admin/subsidiaries', { method: 'POST', body: JSON.stringify(payload) })
        created++
        console.log(`✚ ${name}`)
      }
    } catch (err) {
      console.error(`✗ ${name}:`, (err as Error).message)
    }
  }
  console.log(`\n[scan] Terminé — ${created} créées, ${updated} mises à jour (base: ${BASE}).`)
}

await run()
