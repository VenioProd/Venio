import express, { type Request, type Response, type NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import QualiopiQuestionnaire from '../../models/QualiopiQuestionnaire.js'
import QualiopiCreationToken from '../../models/QualiopiCreationToken.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()

// ── Limites anti-abus pour les endpoints publics ──
//
// Le router de questionnaire est exposé sans auth. On le rate-limite à l'IP
// avec deux profils distincts : création (plus rare) vs submit (plus tolérant
// pour les réponses légitimes). Le limiter global de index.ts s'applique en
// plus de ceux-ci.
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de créations, veuillez patienter.' },
})

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de soumissions, veuillez patienter.' },
})

// Caps applicatifs
const MAX_QUESTIONS = 50
const MAX_ANSWER_LENGTH = 5000
const MAX_RESPONSES_PER_QUESTIONNAIRE = 10_000

// ── Public creation routes ──

// GET validate creation token
router.get('/create/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await QualiopiCreationToken.findOne({ token: req.params.token, active: true }).lean()
    if (!link) return res.status(404).json({ message: 'Lien de creation invalide ou desactive' })
    // Le TTL Mongo finit par purger ; on double-check ici en cas de fenêtre.
    if ((link as { expiresAt?: Date }).expiresAt && (link as { expiresAt?: Date }).expiresAt!.getTime() < Date.now()) {
      return res.status(404).json({ message: 'Lien de creation expiré' })
    }
    res.json({ valid: true })
  } catch (err) { next(err) }
})

// POST create questionnaire via public link
router.post('/create/:token', createLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const link = await QualiopiCreationToken.findOne({ token: req.params.token, active: true })
    if (!link) return res.status(404).json({ message: 'Lien de creation invalide ou desactive' })
    // Anti-réutilisation : 1 token = 1 création max (maxUsage défaut 1).
    const maxUsage = (link as unknown as { maxUsage?: number }).maxUsage ?? 1
    const currentUsage = (link as unknown as { usageCount?: number }).usageCount ?? 0
    if (currentUsage >= maxUsage) {
      return res.status(410).json({ message: 'Lien deja utilise' })
    }
    const expiresAt = (link as unknown as { expiresAt?: Date }).expiresAt
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ message: 'Lien expire' })
    }

    const { title, description, questions } = req.body
    if (!title?.trim() || !questions?.length) {
      return res.status(400).json({ message: 'Titre et questions requis' })
    }
    if (!Array.isArray(questions) || questions.length > MAX_QUESTIONS) {
      return res.status(400).json({ message: `Maximum ${MAX_QUESTIONS} questions` })
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

    // Incrémente l'usage de manière atomique ; désactive si seuil atteint.
    const nextCount = currentUsage + 1
    await QualiopiCreationToken.updateOne(
      { _id: (link as unknown as { _id: unknown })._id },
      {
        $inc: { usageCount: 1 },
        ...(nextCount >= maxUsage ? { $set: { active: false } } : {}),
      }
    )

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
router.post('/:token/submit', submitLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = await QualiopiQuestionnaire.findOne({ token: req.params.token, active: true })
    if (!q) return res.status(404).json({ message: 'Questionnaire introuvable ou desactive' })

    // Cap dur sur le nombre total de réponses par questionnaire (anti-flood).
    if (Array.isArray((q as any).responses) && (q as any).responses.length >= MAX_RESPONSES_PER_QUESTIONNAIRE) {
      return res.status(429).json({ message: 'Nombre maximum de reponses atteint pour ce questionnaire' })
    }

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
        // Cap la longueur de chaque réponse à 5000 chars.
        value: String(a.value || '').slice(0, MAX_ANSWER_LENGTH),
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
