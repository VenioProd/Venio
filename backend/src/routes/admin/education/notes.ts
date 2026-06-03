import express, { type Request, type Response, type NextFunction } from 'express'
import { EducationNote } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

function blocksToMarkdown(blocks: Array<{ type: string; text: string; checked?: boolean; level?: number }>): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `${'#'.repeat(Math.min(Math.max(b.level || 1, 1), 6))} ${b.text}`
        case 'paragraph':
          return b.text
        case 'checklist':
          return `- [${b.checked ? 'x' : ' '}] ${b.text}`
        case 'bullet':
          return `- ${b.text}`
        case 'numbered':
          return `1. ${b.text}`
        case 'quote':
          return `> ${b.text}`
        case 'callout':
          return `> 💡 ${b.text}`
        case 'code':
          return '```\n' + b.text + '\n```'
        case 'divider':
          return '---'
        case 'link':
          return b.text
        case 'mention':
          return b.text || ''
        case 'subpage':
          return b.text || ''
        default:
          return b.text
      }
    })
    .join('\n\n')
}

// GET /
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.archived === 'true') filter.archived = true
    else if (req.query.archived !== 'all') filter.archived = false
    if (req.query.pinned === 'true') filter.pinned = true
    if (req.query.linkType && req.query.linkId && validId(req.query.linkId)) {
      filter['links.type'] = req.query.linkType
      filter['links.refId'] = req.query.linkId
    }
    // Filtre arborescence : ?parent=<id> liste les sous-pages d'une note ;
    // ?parent=root liste les pages de premier niveau (sans parent).
    if (req.query.parent === 'root') filter.parentNote = null
    else if (req.query.parent && validId(req.query.parent)) filter.parentNote = req.query.parent
    if (req.query.search) filter.$text = { $search: String(req.query.search) }
    const sort = String(req.query.sort || '-pinned -updatedAt')
    const [items, total] = await Promise.all([
      EducationNote.find(filter).sort(sort).skip(skip).limit(limit),
      EducationNote.countDocuments(filter),
    ])
    res.json({ notes: items, total })
  } catch (err) {
    next(err)
  }
})

// POST /
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, emoji, cover, blocks, links, tags, pinned, parentNote } = req.body
    const blocksArr = Array.isArray(blocks) ? blocks : []
    const markdown = blocksToMarkdown(blocksArr)
    const created = await EducationNote.create({
      owner: req.user!.id,
      title: title || '',
      emoji: emoji || '',
      cover: cover || '',
      blocks: blocksArr,
      markdown,
      links: Array.isArray(links)
        ? links.filter((l: { type?: string; refId?: string }) => l?.type && validId(l.refId))
        : [],
      tags: Array.isArray(tags) ? tags : [],
      pinned: !!pinned,
      parentNote: parentNote && validId(parentNote) ? parentNote : null,
    })
    await logActivity(req.user!.id, req.user!.id, 'note', created._id, 'CREATE', {})
    res.status(201).json({ note: created })
  } catch (err) {
    next(err)
  }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationNote.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Note introuvable' })
    res.json({ note: item })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationNote.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Note introuvable' })

    const { title, emoji, cover, blocks, links, tags, pinned, archived, parentNote } = req.body
    if (title !== undefined) item.title = title
    if (emoji !== undefined) item.emoji = emoji
    if (cover !== undefined) item.cover = cover
    if (parentNote !== undefined) item.parentNote = parentNote && validId(parentNote) ? parentNote : null
    if (Array.isArray(blocks)) {
      item.blocks = blocks
      item.markdown = blocksToMarkdown(blocks)
    }
    if (Array.isArray(links)) {
      item.links = links.filter((l: { type?: string; refId?: string }) => l?.type && validId(l.refId))
    }
    if (Array.isArray(tags)) item.tags = tags
    if (pinned !== undefined) item.pinned = !!pinned
    if (archived !== undefined) item.archived = !!archived
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'note', item._id, 'UPDATE', {})
    res.json({ note: item })
  } catch (err) {
    next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationNote.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Note introuvable' })
    item.deletedAt = new Date()
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'note', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
