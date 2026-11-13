import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import Call from '../../models/Call.js'
import CallTranscript from '../../models/CallTranscript.js'
import {
  authorQuery,
  findReadableCall,
  readableLead,
  repCallScope,
  type CallDeskScope,
} from '../../lib/callDeskScope.js'
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
import { acceptableKeys, currentValue, leadView } from '../../lib/callAnalysis/fields.js'
import { actionOptions } from '../../lib/callAnalysis/actions.js'
import type { ILead } from '../../types/models/index.js'

/**
 * Analyse d'appel. L'externe lit et valide les siennes ; l'équipe les siennes,
 * et celles de l'externe d'une fiche transmise au closer (c'est alors elle qui
 * valide). L'analyse est cherchée par appel, puis le lead doit être dans le
 * périmètre (`lib/callDeskScope.ts`) ; sinon 404, comme un appel inexistant.
 */
export function createCallAnalysisRoutes(scope: CallDeskScope) {
  const router = express.Router()

  async function findAnalysis(req: Request) {
    const callId = String(req.params.id)
    const analysis = mongoose.isObjectIdOrHexString(callId)
      ? await CallAnalysis.findOne({ call: callId, ...authorQuery(req, scope) })
      : null
    const found = analysis ? await readableLead(req, scope, analysis) : null
    return analysis && found ? { analysis, lead: found.lead } : null
  }

  async function findOwnAnalysis(req: Request, res: Response) {
    const found = await findAnalysis(req)
    if (!found) res.status(404).json({ error: 'Analyse introuvable' })
    return found
  }

  function sendError(err: unknown, res: Response, next: NextFunction) {
    if (isLeadChangeError(err))
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.details })
    return next(err)
  }

  // L'équipe repasse son périmètre d'écriture jusque dans la transaction du service.
  const ctx = (req: Request) => ({
    actor: req.user!.id,
    scope: scope.kind,
    ...(scope.kind === 'team' ? { leadScope: scope.leadFilter(req) } : {}),
  })

  router.get('/calls/:id/analysis', scope.read, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const found = await findOwnAnalysis(req, res)
      if (!found) return
      const view = leadView(found.lead, scope.kind)
      const keys = acceptableKeys(scope.kind)
      // Valeurs actuelles des seuls champs que l'appelant peut accepter (tous pour l'équipe).
      const current: Record<string, unknown> = Object.fromEntries(keys.map((key) => [key, currentValue(view, key)]))
      current.leadTemperature = view.leadTemperature
      current.nextActionAt = view.nextActionAt
      current.callHold = view.callHold
      // Choix des actions SEQUENCE / HANDOFF (séquences, membres) ; l'externe n'inscrit pas en séquence.
      const actionChoices = await actionOptions(found.analysis.output, found.lead, scope.kind)
      return res.json({ analysis: await publicAnalysis(found.analysis), current, acceptableKeys: keys, actionChoices })
    } catch (err) {
      return next(err)
    }
  })

  router.post(
    '/calls/:id/analysis/apply',
    scope.write,
    idempotentRequest,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const found = await findOwnAnalysis(req, res)
        if (!found) return
        const result = await applyCallAnalysis(found.analysis._id, req.body, ctx(req))
        return res.json({ lead: toRepLead(result.lead), analysis: await publicAnalysis(result.analysis) })
      } catch (err) {
        return sendError(err, res, next)
      }
    },
  )

  router.post(
    '/calls/:id/analysis/reject',
    scope.write,
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
   * Aucune analyse encore : elle est créée si l'appel est lisible, dans le
   * périmètre, que son transcript est `DONE` et que le prospect ne s'est pas
   * opposé à l'enregistrement. `null` sinon (404). L'analyse reste celle de
   * l'auteur de l'appel.
   */
  async function createMissingAnalysis(req: Request) {
    const callId = String(req.params.id)
    if (!mongoose.isObjectIdOrHexString(callId)) return null
    const call = await Call.findOne({ _id: callId, ...authorQuery(req, scope) })
      .select('lead author recording')
      .lean()
    const transcript = call
      ? await CallTranscript.findOne({ call: callId, author: call.author, status: 'DONE' })
          .select('segments durationSec')
          .lean()
      : null
    if (!call || !transcript || call.recording?.objection) return null
    if (!(await readableLead(req, scope, call))) return null
    return enqueueAnalysis({
      callId,
      leadId: String(call.lead),
      authorId: String(call.author),
      segments: transcript.segments,
      durationSec: transcript.durationSec,
    })
  }

  router.post(
    '/calls/:id/analysis/retry',
    scope.write,
    idempotentRequest,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const exists = mongoose.isObjectIdOrHexString(String(req.params.id))
          ? await CallAnalysis.exists({ call: String(req.params.id), ...authorQuery(req, scope) })
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
    },
  )

  /**
   * Décision sur une opposition détectée : l'externe peut seulement la
   * confirmer ; l'équipe la confirme ou la lève. Pour l'équipe, une retenue dont
   * l'analyse a été effacée (opposition à l'enregistrement) se décide par
   * l'appel qui l'a posée (`callHold.call`).
   */
  router.post(
    '/calls/:id/analysis/opt-out',
    scope.write,
    idempotentRequest,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const action = req.body?.action
        if (action !== 'CONFIRM' && action !== 'DISMISS') {
          return res.status(400).json({ error: 'action : CONFIRM ou DISMISS', code: 'INVALID_BODY' })
        }
        let lead: ILead
        let holds: boolean
        let analysisErased = false
        const found = await findAnalysis(req)
        if (found) {
          lead = found.lead
          holds = String(lead.callHold?.analysis ?? '') === String(found.analysis._id)
        } else {
          const call = scope.kind === 'team' ? await findReadableCall(req, scope, String(req.params.id)) : null
          if (!call) return res.status(404).json({ error: 'Analyse introuvable' })
          lead = call.lead
          holds = String(lead.callHold?.call ?? '') === String(call.call._id)
          analysisErased = true
        }
        if (!holds) {
          return res.status(409).json({ error: 'Aucune opposition en attente pour cet appel', code: 'NO_CALL_HOLD' })
        }
        const resolved = await resolveCallHold(lead._id as mongoose.Types.ObjectId, action, {
          ...ctx(req),
          analysisErased,
        })
        return res.json({ lead: toRepLead(resolved) })
      } catch (err) {
        return sendError(err, res, next)
      }
    },
  )

  return router
}

export default createCallAnalysisRoutes(repCallScope)
