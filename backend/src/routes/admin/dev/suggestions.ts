import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { requireAnyPermission, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevSuggestion from '../../../models/DevSuggestion.js'
import { DEV_SUGGESTION_STATUSES } from '../../../models/DevSuggestion.js'
import User from '../../../models/User.js'
import {
  applySuggestionFields,
  bulkIssues,
  bulkSuggestions,
  convertSuggestion,
  notifyManagersOfSubmission,
  parseBulkIds,
  parseSuggestionBody,
  recordInitialStatus,
  serializeSuggestion,
  suggestionListQuery,
  transitionSuggestion,
} from '../../../lib/dev/suggestions.js'

const router = express.Router()

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)
const canRead = requireAnyPermission([PERMISSIONS.VIEW_DEV, PERMISSIONS.SUBMIT_DEV_SUGGESTION])
const canManage = requirePermission(PERMISSIONS.MANAGE_DEV)

async function actorOf(req: Request) {
  return { userId: req.user!.id, fallbackReporterId: null }
}

router.get('/suggestions', canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filter, sort } = suggestionListQuery(req.query)
    const items = await DevSuggestion.find(filter)
      .sort(sort)
      .limit(200)
      .populate('project', 'key name color')
      .populate('issue', 'identifier status')
    res.json({ items: items.map((s) => serializeSuggestion(s, req.user!.id)) })
  } catch (err) {
    next(err)
  }
})

router.get('/suggestions/:id', canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const s = await DevSuggestion.findById(req.params.id)
      .populate('project', 'key name color')
      .populate('issue', 'identifier status')
    if (!s) return res.status(404).json({ error: 'Suggestion introuvable' })
    res.json(serializeSuggestion(s, req.user!.id))
  } catch (err) {
    next(err)
  }
})

// Création ouverte à qui peut proposer (commerciaux, équipe) ; le statut est toujours NEW.
router.post('/suggestions', canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = await parseSuggestionBody(req.body, 'create')
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })
    const me = await User.findById(req.user!.id).select('name').lean()
    const s = new DevSuggestion({ source: { kind: 'manual', name: null } })
    applySuggestionFields(s, {
      ...parsed.data,
      requesterUser: new mongoose.Types.ObjectId(req.user!.id),
      requesterName: parsed.data.requesterName || me?.name || '',
    })
    recordInitialStatus(s, req.user!.id)
    await s.save()
    notifyManagersOfSubmission(s, req.user!.id).catch(() => {})
    res.status(201).json(serializeSuggestion(s, req.user!.id))
  } catch (err) {
    next(err)
  }
})

router.patch('/suggestions/:id', canManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const s = await DevSuggestion.findById(req.params.id)
    if (!s) return res.status(404).json({ error: 'Suggestion introuvable' })
    const parsed = await parseSuggestionBody(req.body, 'patch')
    if ('error' in parsed) return res.status(400).json({ error: parsed.error })
    applySuggestionFields(s, parsed.data)
    if (req.body?.archived === true) s.archivedAt = new Date()
    if (req.body?.archived === false) s.archivedAt = null
    await s.save()
    if (typeof req.body?.status === 'string') {
      if (!(DEV_SUGGESTION_STATUSES as readonly string[]).includes(req.body.status)) {
        return res.status(400).json({ error: 'status invalide' })
      }
      const r = await transitionSuggestion(s, req.body.status, {
        actorId: req.user!.id,
        reason: typeof req.body.reason === 'string' ? req.body.reason : null,
      })
      if (!r.ok) return res.status(400).json({ error: r.error, code: r.code })
    }
    res.json(serializeSuggestion(s, req.user!.id))
  } catch (err) {
    next(err)
  }
})

router.post('/suggestions/:id/vote', canRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const s = await DevSuggestion.findById(req.params.id)
    if (!s) return res.status(404).json({ error: 'Suggestion introuvable' })
    const uid = new mongoose.Types.ObjectId(req.user!.id)
    const had = s.voters.some((v) => String(v) === req.user!.id)
    s.voters = had ? s.voters.filter((v) => String(v) !== req.user!.id) : [...s.voters, uid]
    s.voteCount = s.voters.length
    await s.save()
    res.json(serializeSuggestion(s, req.user!.id))
  } catch (err) {
    next(err)
  }
})

router.post('/suggestions/:id/convert', canManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'ID invalide' })
    const s = await DevSuggestion.findById(req.params.id)
    if (!s) return res.status(404).json({ error: 'Suggestion introuvable' })
    const r = await convertSuggestion(s, await actorOf(req), {
      projectId: typeof req.body?.project === 'string' ? req.body.project : null,
      assignee: typeof req.body?.assignee === 'string' ? req.body.assignee : null,
    })
    if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code })
    res.status(r.created ? 201 : 200).json({ suggestion: serializeSuggestion(s, req.user!.id), issue: r.issue })
  } catch (err) {
    next(err)
  }
})

router.post('/suggestions/bulk', canManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = parseBulkIds(req.body?.ids)
    if (!ids) return res.status(400).json({ error: 'ids requis (1 à 100 ObjectId)' })
    const report = await bulkSuggestions(ids, String(req.body?.action), req.body ?? {}, await actorOf(req), {
      allowDelete: true,
    })
    if ('error' in report) return res.status(400).json({ error: report.error })
    res.json(report)
  } catch (err) {
    next(err)
  }
})

router.post('/issues/bulk', canManage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = parseBulkIds(req.body?.ids)
    if (!ids) return res.status(400).json({ error: 'ids requis (1 à 100 ObjectId)' })
    const report = await bulkIssues(ids, String(req.body?.action), req.body ?? {}, req.user!.id, { allowDelete: true })
    if ('error' in report) return res.status(400).json({ error: report.error })
    res.json(report)
  } catch (err) {
    next(err)
  }
})

export default router
