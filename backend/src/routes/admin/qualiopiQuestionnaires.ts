import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import QualiopiQuestionnaire from '../../models/QualiopiQuestionnaire.js'
import QualiopiCreationToken from '../../models/QualiopiCreationToken.js'
import { generateQuestionnairePdf } from '../../lib/pdfQuestionnaire.js'

const router = express.Router()

// ── Admin routes (auth required) ──

router.use(auth)
router.use(requireAdmin)

// ── Creation links (MUST be before /:id routes) ──

// GET all creation tokens
router.get('/creation-links', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const links = await QualiopiCreationToken.find().sort({ createdAt: -1 }).lean()
    res.json(links)
  } catch (err) { next(err) }
})

// POST create a new creation token
router.post('/creation-links', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label } = req.body
    const link = await QualiopiCreationToken.create({ label: label || undefined })
    res.status(201).json(link)
  } catch (err) { next(err) }
})

// DELETE a creation token
router.delete('/creation-links/:tokenId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await QualiopiCreationToken.findByIdAndDelete(req.params.tokenId)
    if (!link) return res.status(404).json({ message: 'Lien introuvable' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// GET all questionnaires (without full responses to keep it light)
router.get('/', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await QualiopiQuestionnaire.find()
      .select('title description active token questions responses createdAt')
      .sort({ createdAt: -1 })
      .lean()

    const result = list.map((q) => ({
      ...q,
      responseCount: q.responses?.length || 0,
      questionCount: q.questions?.length || 0,
      responses: undefined,
    }))

    res.json(result)
  } catch (err) { next(err) }
})

// GET single questionnaire with all responses
router.get('/:id', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findById(req.params.id).lean()
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable' })
    res.json(q)
  } catch (err) { next(err) }
})

// POST create questionnaire
router.post('/', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, questions } = req.body
    if (!title || !questions?.length) return res.status(400).json({ message: 'Titre et questions requis' })

    const q = await QualiopiQuestionnaire.create({
      title,
      description: description || '',
      questions: questions.map((qu: any, i: number) => ({
        type: qu.type || 'text',
        label: qu.label,
        options: qu.options || [],
        required: qu.required !== false,
        order: i,
      })),
      createdBy: (req as any).user?._id,
    })

    res.status(201).json(q)
  } catch (err) { next(err) }
})

// PATCH update questionnaire
router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, questions, active } = req.body
    const update: any = {}
    if (title !== undefined) update.title = title
    if (description !== undefined) update.description = description
    if (active !== undefined) update.active = active
    if (questions !== undefined) {
      update.questions = questions.map((qu: any, i: number) => ({
        type: qu.type || 'text',
        label: qu.label,
        options: qu.options || [],
        required: qu.required !== false,
        order: i,
      }))
    }

    const q = await QualiopiQuestionnaire.findByIdAndUpdate(req.params.id, update, { new: true }).lean()
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable' })
    res.json(q)
  } catch (err) { next(err) }
})

// DELETE questionnaire
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findByIdAndDelete(req.params.id)
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// GET download PDF for a specific response
router.get('/:id/responses/:responseId/pdf', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findById(req.params.id).lean()
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable' })

    const resp = q.responses.find((r: any) => r._id.toString() === req.params.responseId)
    if (!resp) return res.status(404).json({ message: 'Reponse introuvable' })

    const buf = await generateQuestionnairePdf({
      title: q.title,
      description: q.description,
      questions: q.questions,
      response: resp,
    })

    const safeName = resp.respondentName.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, '').replace(/\s+/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="questionnaire_${safeName}.pdf"`)
    res.send(buf)
  } catch (err) { next(err) }
})

// DELETE a specific response
router.delete('/:id/responses/:responseId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findById(req.params.id)
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable' })

    const sub = q.responses as any
    const idx = sub.findIndex((r: any) => r._id.toString() === req.params.responseId)
    if (idx === -1) return res.status(404).json({ message: 'Reponse introuvable' })

    sub.splice(idx, 1)
    await q.save()
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
