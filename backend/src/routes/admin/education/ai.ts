import crypto from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { EducationAiGeneration, EDUCATION_AI_MODES, type EducationAiMode } from '../../../models/education/index.js'
import { ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()
const ENGINE = 'VENIO_STRUCTURED_ASSIST_V1'
const MAX_INPUT_LENGTH = 12_000

type Draft = { text: string; fields: Record<string, string | string[]> }
type Input = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_INPUT_LENGTH) : ''
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean).slice(0, 20)
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

function draftFor(mode: EducationAiMode, input: Input): Draft | null {
  if (mode === 'session_plan') {
    const topic = text(input.topic)
    const level = text(input.level)
    const objectives = list(input.objectives)
    const duration = Math.min(Math.max(Number(input.durationMin) || 120, 15), 480)
    if (!topic || !level || objectives.length === 0) return null
    const intro = Math.max(10, Math.round(duration * 0.15))
    const practice = Math.max(15, Math.round(duration * 0.55))
    const recap = Math.max(10, duration - intro - practice)
    const agenda = [
      `${intro} min — Mise en route : faire émerger les acquis liés à ${topic}.`,
      `${practice} min — Apport guidé et activité d'application en lien avec les objectifs.`,
      `${recap} min — Mise en commun, vérification des acquis et prochaine étape.`,
    ].join('\n')
    return {
      text: `Proposition de séance (${level})\n\nObjectifs :\n${objectives.map((item) => `- ${item}`).join('\n')}\n\nDéroulé :\n${agenda}`,
      fields: { title: titleCase(topic), theme: topic, objectives, agenda, durationMin: String(duration) },
    }
  }

  if (mode === 'session_synthesis') {
    const notes = text(input.instructorNotes)
    if (!notes) return null
    const sentences = notes.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]?/g) ?? [notes]
    const summary = sentences
      .slice(0, 4)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .join(' ')
    return { text: summary, fields: { recap: summary } }
  }

  if (mode === 'assignment_feedback') {
    const comments = text(input.comments)
    const rubric = list(input.rubric)
    if (!comments && rubric.length === 0) return null
    const strengths = rubric.length ? `Critères pris en compte : ${rubric.join(', ')}. ` : ''
    const feedback = `${strengths}${comments || 'Le travail a été examiné au regard du barème.'}\n\nPoint à poursuivre : préciser une action concrète pour consolider le prochain rendu.`
    return { text: feedback, fields: { feedback } }
  }

  const context = text(input.context)
  if (!context) return null
  const items = [
    `Clarifier le résultat attendu : ${context}.`,
    'Préparer les ressources et les critères de réussite.',
    'Réaliser une première étape puis vérifier les acquis.',
    'Noter les ajustements à prévoir pour la suite.',
  ]
  return { text: items.map((item) => `- [ ] ${item}`).join('\n'), fields: { checklist: items } }
}

router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mode = req.body?.mode
    if (!EDUCATION_AI_MODES.includes(mode)) return res.status(400).json({ error: 'Mode d’assistance invalide' })
    const input = req.body?.input
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return res.status(400).json({ error: 'Les informations à assister sont requises' })
    }
    const draft = draftFor(mode, input as Input)
    if (!draft) return res.status(400).json({ error: 'Informations insuffisantes pour générer un brouillon' })

    const generation = await EducationAiGeneration.create({
      owner: req.user!.id,
      actor: req.user!.id,
      mode,
      engine: ENGINE,
      inputFields: Object.keys(input).sort(),
      outputFingerprint: crypto.createHash('sha256').update(JSON.stringify(draft)).digest('hex'),
    })
    res.status(201).json({
      generation: {
        id: generation._id,
        mode: generation.mode,
        engine: generation.engine,
        createdAt: generation.createdAt,
      },
      draft,
      provenance: { reviewRequired: true, persistedInput: false, automaticActions: false },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/generations/:id/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    if (req.body?.reviewed !== true) return res.status(400).json({ error: 'La confirmation de relecture est requise' })
    const generation = await EducationAiGeneration.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!generation) return res.status(404).json({ error: 'Génération introuvable' })
    if (!generation.reviewedAt) {
      generation.reviewedAt = new Date()
      generation.reviewedBy = new mongoose.Types.ObjectId(req.user!.id)
      await generation.save()
    }
    res.json({ generation: { id: generation._id, reviewedAt: generation.reviewedAt, reviewed: true } })
  } catch (error) {
    next(error)
  }
})

router.get('/generations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip } = parseListQuery(req, { defaultLimit: 20, maxLimit: 100 })
    const [generations, total] = await Promise.all([
      EducationAiGeneration.find(ownerFilter(req))
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .select('-outputFingerprint'),
      EducationAiGeneration.countDocuments(ownerFilter(req)),
    ])
    res.json({ generations, total })
  } catch (error) {
    next(error)
  }
})

export default router
