/**
 * Import GitHub → fiches Filiales (une filiale par repo).
 * Découvre les repos VenioProd (+ repos perso listés), récupère les vraies infos
 * (description, stack, activité, issues…) et remplit/rafraîchit les fiches via l'API admin.
 *
 * Marche sur N'IMPORTE QUELLE instance (preview ou prod) — on cible l'API, pas la base.
 * Idempotent : ne réécrase pas les descriptions/infos saisies à la main
 * (seules les infos « GitHub · … » et les liens repo/prod sont rafraîchis).
 *
 *   VENIO_API_BASE=http://localhost:3000 \
 *   VENIO_TOKEN=<jwt super-admin> \
 *   GITHUB_TOKEN=$(gh auth token) \
 *   npx tsx src/scripts/importGithub.ts
 */

const API = process.env.VENIO_API_BASE || 'http://localhost:3000'
const TOKEN = process.env.VENIO_TOKEN || ''
const GH = process.env.GITHUB_TOKEN || ''

if (!TOKEN) throw new Error('VENIO_TOKEN (JWT super-admin) requis')
if (!GH) throw new Error('GITHUB_TOKEN requis (ex: GITHUB_TOKEN=$(gh auth token))')

// ── Périmètre des repos ───────────────────────────────────────────────────────
const ORG = 'VenioProd'
const ORG_DENYLIST = ['Venio'] // la holding / app principale, pas une filiale
const PERSONAL_REPOS = ['raphaelbentv/jiraya', 'raphaelbentv/creatio', 'raphaelbentv/decisio', 'raphaelbentv/Formatio']

// Overrides facultatifs par nom de repo (sinon valeurs auto)
const OVERRIDES: Record<string, { sector?: string; accentColor?: string; status?: string; linkedEntity?: string }> = {
  arrow: { sector: 'École / prospection', status: 'ACTIVE', linkedEntity: 'Arrow', accentColor: '#f59e0b' },
  arrowNeon: { sector: 'École / prospection', linkedEntity: 'Arrow', accentColor: '#f59e0b' },
  sukuna: { sector: 'SaaS santé' },
  lucid: { sector: 'SaaS compta' },
  zephyr: { sector: 'Aérien' },
  hanami: { sector: 'Anime / watchlist' },
  leadforge: { sector: 'Lead generation' },
}

const PALETTE = [
  '#6366f1',
  '#10b981',
  '#ec4899',
  '#f59e0b',
  '#0ea5e9',
  '#8b5cf6',
  '#f43f5e',
  '#14b8a6',
  '#eab308',
  '#3b82f6',
]
function autoColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ── Helpers HTTP ──────────────────────────────────────────────────────────────
async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json', 'User-Agent': 'venio-import' },
  })
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`)
  return res.json() as Promise<T>
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`API ${init?.method || 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

interface Repo {
  full_name: string
  name: string
  description: string | null
  homepage: string | null
  html_url: string
  pushed_at: string
  open_issues_count: number
  default_branch: string
  visibility: string
  topics?: string[]
  archived?: boolean
}

const GH_INFO_PREFIX = 'GitHub · '

async function buildFromRepo(full: string) {
  const r = await gh<Repo>(`/repos/${full}`)
  const langs = await gh<Record<string, number>>(`/repos/${full}/languages`)
  const links: { type: string; label: string; url: string }[] = [{ type: 'repo', label: r.name, url: r.html_url }]
  if (r.homepage) links.push({ type: 'production', label: 'Site', url: r.homepage })
  const infos = [
    { label: `${GH_INFO_PREFIX}Stack`, value: Object.keys(langs).join(', ') || '—' },
    { label: `${GH_INFO_PREFIX}Dernier commit`, value: r.pushed_at ? r.pushed_at.slice(0, 10) : '—' },
    { label: `${GH_INFO_PREFIX}Issues ouvertes`, value: String(r.open_issues_count) },
    { label: `${GH_INFO_PREFIX}Visibilité`, value: r.visibility || '—' },
    { label: `${GH_INFO_PREFIX}Branche`, value: r.default_branch || '—' },
  ]
  if (r.topics?.length) infos.push({ label: `${GH_INFO_PREFIX}Topics`, value: r.topics.join(', ') })
  return { repoName: r.name, archived: !!r.archived, links, infos, tagline: r.description || '' }
}

/** Fusionne sans écraser : remplace liens repo/prod et infos « GitHub · … », garde le reste. */
function merge(existing: any, ghd: { links: any[]; infos: any[]; tagline: string }) {
  const keptLinks = (existing?.links || []).filter((l: any) => l.type !== 'repo' && l.type !== 'production')
  const keptInfos = (existing?.infos || []).filter((i: any) => !String(i.label).startsWith(GH_INFO_PREFIX))
  return {
    links: [...ghd.links, ...keptLinks],
    infos: [...keptInfos, ...ghd.infos],
    tagline: existing?.tagline || ghd.tagline,
    description: existing?.description || ghd.tagline,
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
const orgRepos = await gh<Repo[]>(`/orgs/${ORG}/repos?per_page=100&sort=pushed`)
const repoList = [...orgRepos.filter((r) => !ORG_DENYLIST.includes(r.name)).map((r) => r.full_name), ...PERSONAL_REPOS]

console.log(`[import] ${repoList.length} repos à traiter`)

const { subsidiaries } = await api<{ subsidiaries: any[] }>('/api/admin/subsidiaries?archived=true')
const byName = new Map<string, any>(subsidiaries.map((s) => [s.name.toLowerCase(), s]))

let created = 0
let updated = 0
for (const full of repoList) {
  try {
    const data = await buildFromRepo(full)
    const name = titleCase(data.repoName)
    const ov = OVERRIDES[data.repoName] || {}
    const existing = byName.get(name.toLowerCase())
    const merged = merge(existing, data)
    const payload: Record<string, unknown> = {
      name,
      sector: ov.sector ?? existing?.sector ?? '',
      accentColor: ov.accentColor ?? existing?.accentColor ?? autoColor(name),
      status: ov.status ?? existing?.status ?? (data.archived ? 'PAUSE' : 'INCUBATION'),
      linkedEntity: ov.linkedEntity ?? existing?.linkedEntity ?? '',
      ...merged,
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
    console.error(`✗ ${full}:`, (err as Error).message)
  }
}

console.log(`\n[import] Terminé — ${created} créées, ${updated} mises à jour.`)
