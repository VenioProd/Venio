import express, { type Request, type Response, type NextFunction } from 'express'
import QualiopiQuestionnaire from '../../models/QualiopiQuestionnaire.js'
import QualiopiCreationToken from '../../models/QualiopiCreationToken.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()

// ── Public creation routes ──

// GET validate creation token
router.get('/create/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await QualiopiCreationToken.findOne({ token: req.params.token, active: true }).lean()
    if (!link) return res.status(404).json({ message: 'Lien de creation invalide ou desactive' })
    res.json({ valid: true })
  } catch (err) { next(err) }
})

// POST create questionnaire via public link
router.post('/create/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await QualiopiCreationToken.findOne({ token: req.params.token, active: true })
    if (!link) return res.status(404).json({ message: 'Lien de creation invalide ou desactive' })

    const { title, description, questions } = req.body
    if (!title?.trim() || !questions?.length) {
      return res.status(400).json({ message: 'Titre et questions requis' })
    }

    const q = await QualiopiQuestionnaire.create({
      title: title.trim(),
      description: (description || '').trim(),
      questions: questions.map((qu: any, i: number) => ({
        type: qu.type || 'text',
        label: qu.label,
        options: qu.options || [],
        required: qu.required !== false,
        order: qu.order ?? i,
      })),
      createdBy: null,
    })

    res.status(201).json(q)
  } catch (err) { next(err) }
})

// ── Public fill-out routes ──

// GET questionnaire by token (public, no auth)
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findOne({ token: req.params.token, active: true })
      .select('title description questions token')
      .lean()

    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable ou desactive' })

    res.json(q)
  } catch (err) { next(err) }
})

// POST submit response (public, no auth)
router.post('/:token/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findOne({ token: req.params.token, active: true })
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable ou desactive' })

    const { respondentName, respondentEmail, formation, answers } = req.body

    if (!respondentName?.trim() || !respondentEmail?.trim()) {
      return res.status(400).json({ message: 'Nom et email requis' })
    }

    // Validate required questions
    for (let i = 0; i < q.questions.length; i++) {
      if (q.questions[i].required) {
        const ans = answers?.find((a: any) => a.questionIndex === i)
        if (!ans?.value?.toString().trim()) {
          return res.status(400).json({ message: `La question "${q.questions[i].label}" est obligatoire` })
        }
      }
    }

    ;(q.responses as any).push({
      respondentName: respondentName.trim(),
      respondentEmail: respondentEmail.trim(),
      formation: formation?.trim() || '',
      answers: (answers || []).map((a: any) => ({
        questionIndex: a.questionIndex,
        value: String(a.value || ''),
      })),
    })

    await q.save()

    // Notif super admins : nouvelle réponse questionnaire qualiopi
    notifySuperAdmins({
      type: 'QUALIOPI_QUESTIONNAIRE_RECEIVED',
      title: `Nouvelle réponse questionnaire`,
      message: `${respondentName.trim()} a répondu au questionnaire "${q.title || 'Qualiopi'}"`,
      link: `/admin/qualiopi/questionnaires/${q._id}`,
      metadata: { questionnaireId: String(q._id), respondentEmail: respondentEmail.trim() },
    }).catch(() => {})

    res.status(201).json({ ok: true, message: 'Merci pour votre retour !' })
  } catch (err) { next(err) }
})

export default router
