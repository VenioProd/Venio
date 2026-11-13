import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { leadWriteScopeFilter } from '../../lib/crmScope.js'
import { resolveCallHold } from '../../lib/callAnalysis/apply.js'
import { isLeadChangeError } from '../../lib/crmLeadService.js'
import Call from '../../models/Call.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'

/**
 * Retenue d'opposition décidée par l'équipe sans lire l'appel (décision du
 * 13 nov. 2026). Sert surtout la fiche d'un externe non transmise, dont
 * l'équipe ne lit ni l'appel, ni le transcript, ni l'audio, ni l'analyse :
 * elle reçoit la seule citation qui a déclenché la retenue, sa date et
 * l'auteur de l'appel. Droits d'écriture du CRM sur la fiche exigés, pour lire
 * comme pour décider ; hors périmètre ou sans retenue : 404.
 */
const router = express.Router()

async function heldLead(req: Request) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return null
  return Lead.findOne({ _id: req.params.id, callHold: { $ne: null }, $and: [leadWriteScopeFilter(req)] })
    .select('callHold')
    .lean()
}

router.get(
  '/leads/:id/call-hold',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await heldLead(req)
      if (!lead?.callHold) return res.status(404).json({ error: 'Aucune retenue sur cette fiche' })
      const [analysis, call] = await Promise.all([
        CallAnalysis.findById(lead.callHold.analysis).select('output.optOut').lean(),
        Call.findById(lead.callHold.call).select('author').lean(),
      ])
      const author = call ? await User.findById(call.author).select('name').lean() : null
      const optOut = analysis?.output?.optOut
      return res.json({
        hold: {
          at: lead.callHold.at,
          quote: optOut?.quote ?? null,
          quoteVerified: Boolean(optOut?.quoteVerified),
          // Analyse effacée par une opposition à l'enregistrement : plus de citation.
          analysisErased: !analysis,
          author: author ? { _id: String(author._id), name: author.name } : null,
        },
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/leads/:id/call-hold',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  idempotentRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const action = req.body?.action
      if (action !== 'CONFIRM' && action !== 'DISMISS') {
        return res.status(400).json({ error: 'action : CONFIRM ou DISMISS', code: 'INVALID_BODY' })
      }
      const lead = await heldLead(req)
      if (!lead?.callHold) return res.status(404).json({ error: 'Aucune retenue sur cette fiche' })
      const analysisErased = !(await CallAnalysis.exists({ _id: lead.callHold.analysis }))
      const resolved = await resolveCallHold(lead._id, action, {
        actor: req.user!.id,
        scope: 'team',
        leadScope: leadWriteScopeFilter(req),
        ...(analysisErased ? { analysisErased } : {}),
      })
      return res.json({ lead: { _id: String(resolved._id), callHold: null, doNotCall: resolved.doNotCall } })
    } catch (err) {
      if (isLeadChangeError(err))
        return res.status(err.status).json({ error: err.message, code: err.code, ...err.details })
      return next(err)
    }
  },
)

export default router
