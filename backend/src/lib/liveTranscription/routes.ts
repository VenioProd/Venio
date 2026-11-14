import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import requireRole, { requireAdmin } from '../../middleware/role.js'
import Call from '../../models/Call.js'
import Lead from '../../models/Lead.js'
import { repCallScope, teamCallScope, type CallDeskScope } from '../callDeskScope.js'
import { EXTERNAL_SALES_ROLE } from '../externalSales.js'
import { getLiveSession, liveEligible, subscribeLive, type LiveEvent } from './index.js'

/**
 * `GET /calls/:id/live` : le texte en direct d'un appel, en Server-Sent Events,
 * pour son seul auteur et sur une fiche de son périmètre (404 sinon, même pour
 * l'équipe sur une fiche transmise). 204 quand l'appel ne sera pas transcrit
 * en direct : le navigateur cesse alors de se reconnecter.
 *
 * Événements : `state` (`WAITING`, `LIVE`, `ENDED`), `segment` (un tour, repris
 * par son `id` quand il est complété), `clear` (texte à effacer : fin d'appel
 * ou opposition). Le flux se ferme après `ENDED`.
 */

const HEARTBEAT_MS = 20_000

function createLiveTranscriptRoutes(scope: CallDeskScope, guards: RequestHandler[]) {
  const router = express.Router()

  router.get('/calls/:id/live', ...guards, scope.read, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id)
      const call = mongoose.isObjectIdOrHexString(id)
        ? await Call.findOne({ _id: id, author: req.user!.id }).select('lead status recording').lean()
        : null
      if (!call || !(await Lead.exists({ _id: call.lead, ...scope.leadFilter(req) })))
        return res.status(404).json({ error: 'Call not found' })
      if (!getLiveSession(id) && !(await liveEligible(call))) return res.status(204).end()

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        // `no-transform` : la compression ne met pas le flux en tampon ; `X-Accel-Buffering` : nginx non plus.
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      })
      res.write('retry: 3000\n\n')
      let unsubscribe = () => {}
      const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
      const finish = () => {
        clearInterval(heartbeat)
        unsubscribe()
        if (!res.writableEnded) res.end()
      }
      req.on('close', finish)
      // Fiche réattribuée ou sortie du périmètre pendant l'appel : le flux se ferme au contrôle suivant.
      const stillAllowed = async () => Boolean(await Lead.exists({ _id: call.lead, ...scope.leadFilter(req) }))
      unsubscribe = subscribeLive(
        id,
        (event: LiveEvent) => {
          if (res.writableEnded) return
          const data = event.type === 'segment' ? event.segment : event.type === 'state' ? { status: event.status } : {}
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`)
          if (event.type === 'state' && event.status === 'ENDED') finish()
        },
        stillAllowed,
      )
    } catch (err) {
      next(err)
    }
  })

  return router
}

/** Montés devant `/api/commercial` et `/api/admin/call-desk` : mêmes chemins que les autres routes d'appel. */
export const liveTranscriptRoutes = {
  rep: createLiveTranscriptRoutes(repCallScope, [auth, requireRole(EXTERNAL_SALES_ROLE)]),
  team: createLiveTranscriptRoutes(teamCallScope, [auth, requireAdmin]),
}
