import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import {
  EducationNote,
  EducationStudent,
  EducationClass,
  EducationNotionImport,
  type INotionImportStats,
  type IEducationNotionImport,
} from '../../../models/education/index.js'
import {
  createNotionClient,
  extractNotionId,
  notionBlockToNoteBlock,
  notionPageTitle,
  notionPageToStudentDraft,
  NotionTokenMissingError,
  NotionApiError,
  type NotionClient,
  type NoteBlockShape,
} from '../../../lib/education/notion.js'
import { logActivity, ownerFilter, validId } from './helpers.js'

const router = express.Router()

function blocksToMarkdown(blocks: NoteBlockShape[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading': return `${'#'.repeat(Math.min(Math.max(b.level || 1, 1), 6))} ${b.text}`
        case 'paragraph': return b.text
        case 'checklist': return `- [${b.checked ? 'x' : ' '}] ${b.text}`
        case 'bullet': return `- ${b.text}`
        case 'numbered': return `1. ${b.text}`
        case 'quote': return `> ${b.text}`
        case 'callout': return `> 💡 ${b.text}`
        case 'code': return '```\n' + b.text + '\n```'
        case 'divider': return '---'
        case 'link': return b.text
        default: return b.text
      }
    })
    .join('\n\n')
}

interface ImportBody {
  pageIdOrUrl?: string
  databaseIdOrUrl?: string
  query?: string
  classId?: string | null
}

interface ImportContext {
  dryRun: boolean
  owner: mongoose.Types.ObjectId
  client: NotionClient
  stats: INotionImportStats
  messages: string[]
  errors: string[]
}

function freshStats(): INotionImportStats {
  return { created: 0, updated: 0, skipped: 0, errors: 0 }
}

async function importPageAsNote(ctx: ImportContext, pageId: string): Promise<void> {
  const page = await ctx.client.getPage(pageId)
  const title = notionPageTitle(page) || '(Sans titre)'
  const url = String((page as { url?: string }).url || '')
  const lastEditedStr = String((page as { last_edited_time?: string }).last_edited_time || '')
  const lastEditedTime = lastEditedStr ? new Date(lastEditedStr) : null

  const rawBlocks = await ctx.client.listBlockChildren(pageId)
  const blocks = rawBlocks.map((b) => notionBlockToNoteBlock(b))
  const markdown = blocksToMarkdown(blocks)

  const existing = await EducationNote.findOne({
    owner: ctx.owner,
    'source.provider': 'notion',
    'source.id': pageId,
    deletedAt: null,
  })

  if (ctx.dryRun) {
    ctx.messages.push(`[dry-run] ${existing ? 'update' : 'create'} note "${title}" (${blocks.length} blocs)`)
    if (existing) ctx.stats.updated += 1
    else ctx.stats.created += 1
    return
  }

  if (existing) {
    existing.title = title
    existing.blocks = blocks
    existing.markdown = markdown
    existing.source = { provider: 'notion', id: pageId, url, lastEditedTime }
    await existing.save()
    ctx.stats.updated += 1
    ctx.messages.push(`Updated note "${title}"`)
  } else {
    await EducationNote.create({
      owner: ctx.owner,
      title,
      blocks,
      markdown,
      source: { provider: 'notion', id: pageId, url, lastEditedTime },
    })
    ctx.stats.created += 1
    ctx.messages.push(`Created note "${title}"`)
  }
}

async function importDatabaseAsStudents(
  ctx: ImportContext,
  databaseId: string,
  classId: mongoose.Types.ObjectId,
  query?: string,
): Promise<void> {
  // Optional filter: title contains query (best-effort, only when provided)
  const body: Record<string, unknown> | undefined = query
    ? undefined  // The Notion query API requires knowing the title property name; skip filter and let result-side filter happen.
    : undefined
  const rows = await ctx.client.queryDatabase(databaseId, body)
  const q = (query || '').trim().toLowerCase()

  for (const row of rows) {
    try {
      const pageId = String((row as { id?: string }).id || '')
      if (!pageId) {
        ctx.stats.skipped += 1
        continue
      }
      const draft = notionPageToStudentDraft(row)
      if (q) {
        const hay = `${draft.firstName} ${draft.lastName} ${draft.email}`.toLowerCase()
        if (!hay.includes(q)) {
          ctx.stats.skipped += 1
          continue
        }
      }
      if (!draft.lastName) {
        ctx.stats.skipped += 1
        ctx.messages.push(`Skip row ${pageId}: no last name detected`)
        continue
      }
      const url = String((row as { url?: string }).url || '')
      const lastEditedStr = String((row as { last_edited_time?: string }).last_edited_time || '')
      const lastEditedTime = lastEditedStr ? new Date(lastEditedStr) : null

      const existing = await EducationStudent.findOne({
        owner: ctx.owner,
        'source.provider': 'notion',
        'source.id': pageId,
        deletedAt: null,
      })

      if (ctx.dryRun) {
        if (existing) ctx.stats.updated += 1
        else ctx.stats.created += 1
        ctx.messages.push(`[dry-run] ${existing ? 'update' : 'create'} student ${draft.firstName} ${draft.lastName}`)
        continue
      }

      if (existing) {
        if (draft.firstName) existing.firstName = draft.firstName
        existing.lastName = draft.lastName
        if (draft.email) existing.email = draft.email
        if (draft.phone) existing.phone = draft.phone
        existing.classId = classId
        existing.source = { provider: 'notion', id: pageId, url, lastEditedTime }
        await existing.save()
        ctx.stats.updated += 1
      } else {
        await EducationStudent.create({
          owner: ctx.owner,
          classId,
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone,
          status: 'ACTIVE',
          source: { provider: 'notion', id: pageId, url, lastEditedTime },
        })
        ctx.stats.created += 1
      }
    } catch (err) {
      ctx.stats.errors += 1
      ctx.errors.push(err instanceof Error ? err.message : 'Erreur inconnue sur une ligne')
    }
  }
}

async function runImport(
  req: Request,
  body: ImportBody,
  dryRun: boolean,
): Promise<{ sourceType: 'page' | 'database'; pageId: string; databaseId: string; classId: mongoose.Types.ObjectId | null; stats: INotionImportStats; messages: string[]; errors: string[] } | { error: string; status: number }> {
  let client: NotionClient
  try {
    client = createNotionClient()
  } catch (err) {
    if (err instanceof NotionTokenMissingError) {
      return { error: err.message, status: 503 }
    }
    throw err
  }

  const stats = freshStats()
  const messages: string[] = []
  const errors: string[] = []
  const ctx: ImportContext = {
    dryRun,
    owner: new mongoose.Types.ObjectId(req.user!.id),
    client,
    stats,
    messages,
    errors,
  }

  // Decide source: prefer explicit databaseIdOrUrl when classId is provided.
  const pageInput = (body.pageIdOrUrl || '').trim()
  const dbInput = (body.databaseIdOrUrl || '').trim()
  const wantsDatabase = !!dbInput
  const wantsPage = !!pageInput

  if (!wantsPage && !wantsDatabase) {
    return { error: 'pageIdOrUrl ou databaseIdOrUrl requis', status: 400 }
  }

  let sourceType: 'page' | 'database' = 'page'
  let pageId = ''
  let databaseId = ''
  let classId: mongoose.Types.ObjectId | null = null

  if (wantsDatabase) {
    sourceType = 'database'
    const id = extractNotionId(dbInput)
    if (!id) return { error: 'databaseIdOrUrl invalide', status: 400 }
    databaseId = id
    if (!validId(body.classId)) return { error: 'classId requis pour import de base (étudiants)', status: 400 }
    const klass = await EducationClass.findOne({ _id: body.classId, owner: ctx.owner, deletedAt: null })
    if (!klass) return { error: 'Classe introuvable', status: 404 }
    classId = klass._id as mongoose.Types.ObjectId
    try {
      await importDatabaseAsStudents(ctx, databaseId, classId, body.query)
    } catch (err) {
      if (err instanceof NotionApiError) return { error: err.message, status: err.status }
      throw err
    }
  } else {
    sourceType = 'page'
    const id = extractNotionId(pageInput)
    if (!id) return { error: 'pageIdOrUrl invalide', status: 400 }
    pageId = id
    try {
      await importPageAsNote(ctx, pageId)
    } catch (err) {
      if (err instanceof NotionApiError) return { error: err.message, status: err.status }
      throw err
    }
  }

  return { sourceType, pageId, databaseId, classId, stats, messages, errors }
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// GET /logs — list past imports (latest first)
router.get('/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const skip = Math.max(Number(req.query.skip) || 0, 0)
    const filter = { owner: req.user!.id }
    const [items, total] = await Promise.all([
      EducationNotionImport.find(filter).sort('-createdAt').skip(skip).limit(limit),
      EducationNotionImport.countDocuments(filter),
    ])
    res.json({ logs: items, total })
  } catch (err) { next(err) }
})

// POST /preview — dry-run import, no writes, no log persisted
router.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body || {}) as ImportBody
    const result = await runImport(req, body, true)
    if ('error' in result) return res.status(result.status).json({ error: result.error })
    res.json({
      dryRun: true,
      sourceType: result.sourceType,
      pageId: result.pageId,
      databaseId: result.databaseId,
      classId: result.classId,
      stats: result.stats,
      messages: result.messages,
      errors: result.errors,
    })
  } catch (err) { next(err) }
})

// POST /import — real import, persists log
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body || {}) as ImportBody
    const startedAt = new Date()
    let logDoc: mongoose.HydratedDocument<IEducationNotionImport> | null = null
    try {
      const result = await runImport(req, body, false)
      if ('error' in result) return res.status(result.status).json({ error: result.error })

      const hasErrors = result.errors.length > 0 || result.stats.errors > 0
      const hasAnything = result.stats.created + result.stats.updated + result.stats.skipped + result.stats.errors > 0
      const status = !hasAnything
        ? 'error'
        : hasErrors && (result.stats.created + result.stats.updated > 0)
          ? 'partial'
          : hasErrors ? 'error' : 'success'

      logDoc = await EducationNotionImport.create({
        owner: req.user!.id,
        sourceType: result.sourceType,
        pageId: result.pageId,
        databaseId: result.databaseId,
        sourceUrl: (body.pageIdOrUrl || body.databaseIdOrUrl || '').trim(),
        classId: result.classId,
        dryRun: false,
        status,
        stats: result.stats,
        messages: result.messages,
        errors: result.errors,
        startedAt,
        completedAt: new Date(),
      })
      await logActivity(req.user!.id, req.user!.id, 'note', logDoc._id, 'CREATE', { kind: 'notion-import', sourceType: result.sourceType })
      res.json({ log: logDoc })
    } catch (err) {
      // Persist failure log to give the user a trail
      try {
        await EducationNotionImport.create({
          owner: req.user!.id,
          sourceType: body.databaseIdOrUrl ? 'database' : 'page',
          pageId: '',
          databaseId: '',
          sourceUrl: (body.pageIdOrUrl || body.databaseIdOrUrl || '').trim(),
          classId: validId(body.classId) ? body.classId : null,
          dryRun: false,
          status: 'error',
          stats: freshStats(),
          messages: [],
          errors: [err instanceof Error ? err.message : 'Erreur inconnue'],
          startedAt,
          completedAt: new Date(),
        })
      } catch { /* best-effort */ }
      throw err
    }
  } catch (err) { next(err) }
})

export default router
