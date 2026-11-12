import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import Call from '../../models/Call.js'
import CallTranscript from '../../models/CallTranscript.js'
import Lead from '../../models/Lead.js'
import { repLeadFilter } from '../../lib/externalSales.js'
import { isLeadChangeError } from '../../lib/crmLeadService.js'
import { toRepLead } from '../../lib/repLeadView.js'
import {
  applyCallAnalysis,
  enqueueAnalysis,
  rejectCallAnalysis,
  resolveCallHold,
  retryAnalysis,
} from '../../lib/callAnalysis/index.js'
import { publicAnalysis } from '../../lib/callAnalysis/apply.js'
import { currentValue, leadView, REP_ACCEPTABLE_KEYS } from '../../lib/callAnalysis/fields.js'

/**
 * Analyse d'appel côté commercial externe. Auteur seulement : l'analyse est
 * cherchée par appel et par auteur, puis le lead doit être dans son périmètre ;
 * sinon 404, comme un appel inexistant.
 */
const router = express.Router()

async function findOwnAnalysis(req: Request, res: Response) {
  const callId = String(req.params.id)
  const analysis = mongoose.isObjectIdOrHexString(callId)
    ? await CallAnalysis.findOne({ call: callId, author: req.user!.id })
    : null
  const lead = analysis ? await Lead.findOne({ _id: analysis.lead, ...repLeadFilter(req.user!.id) }) : null
  if (!analysis || !lead) {
    res.status(404).json({ error: 'Analyse introuvable' })
    return null
  }
  return { analysis, lead }
}

function sendError(err: unknown, res: Response, next: NextFunction) {
  if (isLeadChangeError(err)) return res.status(err.status).json({ error: err.message, code: err.code, ...err.details })
  return next(err)
}

const ctx = (req: Request) => ({ actor: req.user!.id, scope: 'rep' as const })

router.get('/calls/:id/analysis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const found = await findOwnAnalysis(req, res)
    if (!found) return
    const view = leadView(found.lead, 'rep')
    // Valeurs actuelles des seuls champs que l'externe voit ; les autres restent à l'équipe.
    const current: Record<string, unknown> = Object.fromEntries(
      REP_ACCEPTABLE_KEYS.map((key) => [key, currentValue(view, key)]),
    )
    current.leadTemperature = view.leadTemperature
    current.nextActionAt = view.nextActionAt
    current.callHold = view.callHold
    return res.json({ analysis: await publicAnalysis(found.analysis), current, acceptableKeys: REP_ACCEPTABLE_KEYS })
  } catch (err) {
    return next(err)
  }
})

router.post('/calls/:id/analysis/apply', idempotentRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const found = await findOwnAnalysis(req, res)
    if (!found) return
    const result = await applyCallAnalysis(found.analysis._id, req.body, ctx(req))
    return res.json({ lead: toRepLead(result.lead), analysis: await publicAnalysis(result.analysis) })
  } catch (err) {
    return sendError(err, res, next)
  }
})

router.post(
  '/calls/:id/analysis/reject',
  idempotentRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const found = await findOwnAnalysis(req, res)
      if (!found) return
      const analysis = await rejectCallAnalysis(found.analysis._id, ctx(req))
      return res.json({ analysis: await publicAnalysis(analysis) })
    } catch (err) {
      return sendError(err, res, next)
    }
  },
)

/**
 * Aucune analyse encore : elle est créée si l'appel est à l'auteur, dans son
 * périmètre, que son transcript est `DONE` et que le prospect ne s'est pas
 * opposé à l'enregistrement. `null` sinon (404).
 */
async function createMissingAnalysis(req: Request) {
  const callId = String(req.params.id)
  if (!mongoose.isObjectIdOrHexString(callId)) return null
  const [call, transcript] = await Promise.all([
    Call.findOne({ _id: callId, author: req.user!.id }).select('lead author recording').lean(),
    CallTranscript.findOne({ call: callId, author: req.user!.id, status: 'DONE' })
      .select('segments durationSec')
      .lean(),
  ])
  if (!call || !transcript || call.recording?.objection) return null
  if (!(await Lead.exists({ _id: call.lead, ...repLeadFilter(req.user!.id) }))) return null
  return enqueueAnalysis({
    callId,
    leadId: String(call.lead),
    authorId: String(call.author),
    segments: transcript.segments,
    durationSec: transcript.durationSec,
  })
}

router.post('/calls/:id/analysis/retry', idempotentRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exists = mongoose.isObjectIdOrHexString(String(req.params.id))
      ? await CallAnalysis.exists({ call: String(req.params.id), author: req.user!.id })
      : null
    if (!exists) {
      const created = await createMissingAnalysis(req)
      if (!created) return res.status(404).json({ error: 'Analyse introuvable' })
      return res.status(202).json({ analysis: await publicAnalysis(created) })
    }
    const found = await findOwnAnalysis(req, res)
    if (!found) return
    const analysis = await retryAnalysis(found.analysis._id)
    if (!analysis) {
      return res.status(409).json({
        error: 'Seule une analyse en échec ou pas encore relue peut être relancée',
        code: 'ANALYSIS_NOT_RETRYABLE',
      })
    }
    return res.status(202).json({ analysis: await publicAnalysis(analysis) })
  } catch (err) {
    return sendError(err, res, next)
  }
})

// Extension du contrat : décision sur une opposition détectée (l'externe peut seulement la confirmer).
router.post(
  '/calls/:id/analysis/opt-out',
  idempotentRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = req.body?.action
      if (action !== 'CONFIRM' && action !== 'DISMISS') {
        return res.status(400).json({ error: 'action : CONFIRM ou DISMISS', code: 'INVALID_BODY' })
      }
      const found = await findOwnAnalysis(req, res)
      if (!found) return
      if (String(found.lead.callHold?.analysis ?? '') !== String(found.analysis._id)) {
        return res.status(409).json({ error: 'Aucune opposition en attente pour cet appel', code: 'NO_CALL_HOLD' })
      }
      const lead = await resolveCallHold(found.lead._id as mongoose.Types.ObjectId, action, ctx(req))
      return res.json({ lead: toRepLead(lead) })
    } catch (err) {
      return sendError(err, res, next)
    }
  },
)

export default router
