import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import CallTranscript from '../../models/CallTranscript.js'
import { authorQuery, readableLead, repCallScope, type CallDeskScope } from '../../lib/callDeskScope.js'

/**
 * Le transcript d'un appel, lisible par celui qui a appelé ; pour l'équipe,
 * aussi celui de l'externe d'une fiche transmise. Tout autre cas répond 404,
 * y compris un lead réattribué ou sorti du périmètre.
 */
export function createCallTranscriptRoutes(scope: CallDeskScope) {
  const router = express.Router()

  router.get('/calls/:id/transcript', scope.read, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id)
      const transcript = mongoose.isObjectIdOrHexString(id)
        ? await CallTranscript.findOne({ call: id, ...authorQuery(req, scope) })
            .select('lead author status language segments durationSec')
            .lean()
        : null
      if (!transcript || !(await readableLead(req, scope, transcript)))
        return res.status(404).json({ error: 'Transcript not found' })
      return res.json({
        status: transcript.status,
        language: transcript.language,
        segments: transcript.segments,
        durationSec: transcript.durationSec,
      })
    } catch (err) {
      return next(err)
    }
  })

  return router
}

export default createCallTranscriptRoutes(repCallScope)
