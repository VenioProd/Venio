/**
 * VENIO-41 — Notion import helpers.
 *
 * Pure helpers + a thin Notion API client (fetch-based) used by the
 * `/api/admin/education/notion` route. Helpers are deliberately pure so they
 * can be unit-tested without hitting the network.
 *
 * Token discovery: `NOTION_API_TOKEN` (required), `NOTION_VERSION` (optional,
 * default `2022-06-28`). The token is never returned to the client.
 */

export const NOTION_DEFAULT_VERSION = '2022-06-28'
export const NOTION_API_BASE = 'https://api.notion.com/v1'

export class NotionTokenMissingError extends Error {
  status = 503
  constructor() {
    super('NOTION_API_TOKEN is not configured on the server.')
    this.name = 'NotionTokenMissingError'
  }
}

export class NotionApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'NotionApiError'
  }
}

// ─── Helpers (pure) ──────────────────────────────────────────────────────────

/**
 * Extracts a Notion id (UUID with or without dashes) from a raw input that may
 * be a UUID, a long Notion id, or a URL (workspace + slug-32hex).
 * Returns a lowercase dashed UUID string, or null if not found.
 */
export function extractNotionId(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null
  const cleaned = input.trim()
  if (!cleaned) return null

  // 1. Dashed UUID directly
  const dashed = cleaned.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  if (dashed) return dashed[0].toLowerCase()

  // 2. Flat 32-hex (typical of Notion URLs)
  const flat = cleaned.match(/[0-9a-fA-F]{32}/)
  if (flat) {
    const h = flat[0].toLowerCase()
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  }

  return null
}

interface NotionRichTextItem {
  plain_text?: string
  text?: { content?: string }
}

/** Converts an array of Notion rich_text items into plain text. */
export function notionRichTextToPlainText(rich: NotionRichTextItem[] | undefined | null): string {
  if (!Array.isArray(rich)) return ''
  return rich
    .map((r) => r?.plain_text ?? r?.text?.content ?? '')
    .join('')
}

/** Returns the title of a Notion page from its `properties` payload. */
export function notionPageTitle(page: Record<string, unknown> | null | undefined): string {
  if (!page) return ''
  const props = (page as { properties?: Record<string, unknown> }).properties || {}
  for (const value of Object.values(props)) {
    const v = value as { type?: string; title?: NotionRichTextItem[] }
    if (v?.type === 'title' && Array.isArray(v.title)) {
      const text = notionRichTextToPlainText(v.title)
      if (text) return text
    }
  }
  return ''
}

const BLOCK_TYPE_MAP: Record<string, { type: string; level?: number }> = {
  paragraph: { type: 'paragraph' },
  heading_1: { type: 'heading', level: 1 },
  heading_2: { type: 'heading', level: 2 },
  heading_3: { type: 'heading', level: 3 },
  bulleted_list_item: { type: 'bullet' },
  numbered_list_item: { type: 'numbered' },
  to_do: { type: 'checklist' },
  quote: { type: 'quote' },
  callout: { type: 'callout' },
  code: { type: 'code' },
  divider: { type: 'divider' },
  bookmark: { type: 'link' },
}

export interface NoteBlockShape {
  id: string
  type: 'heading' | 'paragraph' | 'checklist' | 'bullet' | 'numbered' | 'quote' | 'callout' | 'code' | 'divider' | 'link'
  text: string
  checked: boolean
  level: number
  meta: Record<string, unknown>
}

/**
 * Best-effort conversion of a Notion block into our local NoteBlock shape.
 * Unknown / unsupported types are turned into a callout block surfacing the
 * raw type so the user can spot them after import.
 */
export function notionBlockToNoteBlock(block: Record<string, unknown>): NoteBlockShape {
  const id = String((block as { id?: string }).id || cryptoRandom())
  const rawType = String((block as { type?: string }).type || 'unsupported')
  const payload = (block as Record<string, unknown>)[rawType] as Record<string, unknown> | undefined

  if (rawType === 'divider') {
    return { id, type: 'divider', text: '', checked: false, level: 1, meta: {} }
  }

  if (rawType === 'bookmark') {
    const url = String((payload?.url as string | undefined) || '')
    return { id, type: 'link', text: url, checked: false, level: 1, meta: { url } }
  }

  if (rawType === 'code') {
    const text = notionRichTextToPlainText(payload?.rich_text as NotionRichTextItem[] | undefined)
    const language = String((payload?.language as string | undefined) || '')
    return { id, type: 'code', text, checked: false, level: 1, meta: { language } }
  }

  const mapped = BLOCK_TYPE_MAP[rawType]
  if (!mapped) {
    return buildUnsupportedBlock(rawType, id)
  }

  const richText = (payload?.rich_text as NotionRichTextItem[] | undefined) || []
  const text = notionRichTextToPlainText(richText)
  const checked = rawType === 'to_do' ? Boolean(payload?.checked) : false
  const level = mapped.level ?? 1
  return {
    id,
    type: mapped.type as NoteBlockShape['type'],
    text,
    checked,
    level,
    meta: {},
  }
}

/** Surface an unsupported Notion block as a callout so the user notices it. */
export function buildUnsupportedBlock(rawType: string, id?: string): NoteBlockShape {
  return {
    id: id || cryptoRandom(),
    type: 'callout',
    text: `Bloc Notion non supporté: ${rawType}`,
    checked: false,
    level: 1,
    meta: { unsupported: true, notionType: rawType },
  }
}

function cryptoRandom(): string {
  // Avoid pulling in `crypto` — only used as a fallback id when Notion omits one.
  return 'b_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ─── Student property extraction (Notion DB rows) ────────────────────────────

const FIRSTNAME_PROP_HINTS = ['prenom', 'prénom', 'firstname', 'first name', 'first']
const LASTNAME_PROP_HINTS = ['nom', 'lastname', 'last name', 'last', 'name', 'nom complet', 'fullname', 'full name']
const EMAIL_PROP_HINTS = ['email', 'e-mail', 'mail', 'courriel']
const PHONE_PROP_HINTS = ['phone', 'telephone', 'téléphone', 'tel', 'mobile']

interface NotionProperty {
  type?: string
  title?: NotionRichTextItem[]
  rich_text?: NotionRichTextItem[]
  email?: string | null
  phone_number?: string | null
  select?: { name?: string } | null
  number?: number | null
  url?: string | null
}

function readPropertyText(prop: NotionProperty | undefined | null): string {
  if (!prop) return ''
  switch (prop.type) {
    case 'title': return notionRichTextToPlainText(prop.title)
    case 'rich_text': return notionRichTextToPlainText(prop.rich_text)
    case 'email': return prop.email || ''
    case 'phone_number': return prop.phone_number || ''
    case 'url': return prop.url || ''
    case 'select': return prop.select?.name || ''
    case 'number': return prop.number != null ? String(prop.number) : ''
    default: return ''
  }
}

export interface StudentDraft {
  firstName: string
  lastName: string
  email: string
  phone: string
}

function findProp(props: Record<string, NotionProperty>, hints: string[], type?: string): NotionProperty | null {
  const keys = Object.keys(props)
  for (const k of keys) {
    const low = k.toLowerCase().trim()
    if (hints.includes(low)) {
      if (!type || props[k]?.type === type) return props[k]
    }
  }
  // Fallback by type alone
  if (type) {
    for (const k of keys) {
      if (props[k]?.type === type) return props[k]
    }
  }
  return null
}

/**
 * Best-effort extraction of student-like fields from a Notion DB row.
 * Always returns a draft; the caller decides whether `lastName` is valid.
 */
export function notionPageToStudentDraft(page: Record<string, unknown>): StudentDraft {
  const props = ((page as { properties?: Record<string, NotionProperty> }).properties || {}) as Record<string, NotionProperty>

  const titleProp = findProp(props, [], 'title')
  const titleText = readPropertyText(titleProp)
  const titleParts = titleText.split(/\s+/).filter(Boolean)

  const firstNameProp = findProp(props, FIRSTNAME_PROP_HINTS)
  // Prefer a non-title lastName column (rich_text 'nom') over matching the title twice.
  let lastNameProp =
    Object.entries(props).find(
      ([k, v]) =>
        LASTNAME_PROP_HINTS.includes(k.toLowerCase().trim()) &&
        v?.type !== 'title',
    )?.[1] || null
  if (!lastNameProp) lastNameProp = findProp(props, LASTNAME_PROP_HINTS)
  let firstName = readPropertyText(firstNameProp)
  let lastName = readPropertyText(lastNameProp)

  if (!lastName && titleParts.length > 0) {
    if (titleParts.length === 1) {
      lastName = titleParts[0]
    } else {
      firstName = firstName || titleParts.slice(0, -1).join(' ')
      lastName = titleParts[titleParts.length - 1]
    }
  } else if (lastName && !firstName && /\s/.test(lastName)) {
    // Title-only column matched as last name: split into first + last.
    const parts = lastName.split(/\s+/).filter(Boolean)
    if (parts.length > 1) {
      firstName = parts.slice(0, -1).join(' ')
      lastName = parts[parts.length - 1]
    }
  }

  const emailProp = findProp(props, EMAIL_PROP_HINTS, 'email') || findProp(props, EMAIL_PROP_HINTS)
  const phoneProp = findProp(props, PHONE_PROP_HINTS, 'phone_number') || findProp(props, PHONE_PROP_HINTS)

  return {
    firstName: (firstName || '').trim(),
    lastName: (lastName || '').trim(),
    email: (readPropertyText(emailProp) || '').trim().toLowerCase(),
    phone: (readPropertyText(phoneProp) || '').trim(),
  }
}

// ─── HTTP client ─────────────────────────────────────────────────────────────

export interface NotionClientOptions {
  token?: string | null
  version?: string | null
  fetchImpl?: typeof fetch
}

export interface NotionClient {
  getPage(pageId: string): Promise<Record<string, unknown>>
  getDatabase(databaseId: string): Promise<Record<string, unknown>>
  listBlockChildren(blockId: string): Promise<Array<Record<string, unknown>>>
  queryDatabase(databaseId: string, body?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
}

export function getNotionTokenFromEnv(): string {
  const token = (process.env.NOTION_API_TOKEN || '').trim()
  if (!token) throw new NotionTokenMissingError()
  return token
}

export function getNotionVersionFromEnv(): string {
  return (process.env.NOTION_VERSION || '').trim() || NOTION_DEFAULT_VERSION
}

export function createNotionClient(opts: NotionClientOptions = {}): NotionClient {
  const token = (opts.token ?? process.env.NOTION_API_TOKEN ?? '').trim()
  if (!token) throw new NotionTokenMissingError()
  const version = (opts.version ?? process.env.NOTION_VERSION ?? '').trim() || NOTION_DEFAULT_VERSION
  const fetchImpl = opts.fetchImpl ?? fetch

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${NOTION_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new NotionApiError(
        `Notion API ${method} ${path} → ${res.status}${txt ? `: ${txt.slice(0, 300)}` : ''}`,
        res.status,
      )
    }
    return (await res.json()) as T
  }

  async function paginate<T>(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T[]> {
    const out: T[] = []
    let cursor: string | undefined
    let safety = 0
    do {
      const qs = method === 'GET' && cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : (method === 'GET' ? '?page_size=100' : '')
      const reqBody = method === 'POST'
        ? { ...(body || {}), start_cursor: cursor, page_size: 100 }
        : undefined
      const json = await request<{ results: T[]; has_more?: boolean; next_cursor?: string | null }>(
        method,
        `${path}${qs}`,
        reqBody,
      )
      out.push(...(json.results || []))
      cursor = json.has_more ? (json.next_cursor || undefined) : undefined
      safety += 1
      if (safety > 50) break // hard cap: 5_000 items
    } while (cursor)
    return out
  }

  return {
    getPage: (pageId) => request('GET', `/pages/${pageId}`),
    getDatabase: (databaseId) => request('GET', `/databases/${databaseId}`),
    listBlockChildren: (blockId) => paginate(`/blocks/${blockId}/children`, 'GET'),
    queryDatabase: (databaseId, body) => paginate(`/databases/${databaseId}/query`, 'POST', body || {}),
  }
}
