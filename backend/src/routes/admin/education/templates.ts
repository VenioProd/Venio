import express, { type Request, type Response, type NextFunction } from 'express'
import { EducationTemplate, TEMPLATE_KINDS, type EducationTemplateKind } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.kind && TEMPLATE_KINDS.includes(req.query.kind as EducationTemplateKind)) filter.kind = req.query.kind
    const [items, total] = await Promise.all([
      EducationTemplate.find(filter).sort(sort).skip(skip).limit(limit),
      EducationTemplate.countDocuments(filter),
    ])
    res.json({ templates: items, total })
  } catch (err) { next(err) }
})

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { kind, name, description, body, tags } = req.body
    if (!TEMPLATE_KINDS.includes(kind)) return res.status(400).json({ error: 'kind invalide' })
    if (!name?.trim()) return res.status(400).json({ error: 'name requis' })
    const created = await EducationTemplate.create({
      owner: req.user!.id,
      kind,
      name: name.trim(),
      description: description || '',
      body: body || {},
      tags: Array.isArray(tags) ? tags : [],
    })
    await logActivity(req.user!.id, req.user!.id, 'template', created._id, 'CREATE', { kind })
    res.status(201).json({ template: created })
  } catch (err) { next(err) }
})

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationTemplate.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Template introuvable' })
    const { name, description, body, tags } = req.body
    if (name !== undefined) item.name = name.trim()
    if (description !== undefined) item.description = description
    if (body !== undefined) item.body = body
    if (Array.isArray(tags)) item.tags = tags
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'template', item._id, 'UPDATE', {})
    res.json({ template: item })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationTemplate.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Template introuvable' })
    item.deletedAt = new Date()
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'template', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
