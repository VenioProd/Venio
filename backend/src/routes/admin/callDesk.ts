import express from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { teamCallScope } from '../../lib/callDeskScope.js'
import { createCallDeskRoutes } from '../commercial/callDesk.js'
import { createCallsRoutes } from '../commercial/calls.js'
import { createCallTranscriptRoutes } from '../commercial/callTranscripts.js'
import { createCallAnalysisRoutes } from '../commercial/callAnalysis.js'
import callHoldRoutes from './callHold.js'

/**
 * Poste d'appel de l'équipe interne : les routeurs de l'espace commercial,
 * montés avec le périmètre de l'équipe (`teamCallScope` : périmètre d'écriture
 * du CRM hors listes d'appel des externes non transmises ; `VIEW_CRM` pour
 * lire, `MANAGE_CRM` pour appeler et écrire). Pas d'import de listes ici.
 * Seule exception à ce périmètre : la décision sur une retenue d'opposition
 * (`callHold.ts`), sur la seule citation, pour toute fiche où l'on écrit.
 */
const router = express.Router()

router.use(auth)
router.use(requireAdmin)
router.use(createCallDeskRoutes(teamCallScope))
router.use(createCallsRoutes(teamCallScope))
router.use(createCallTranscriptRoutes(teamCallScope))
router.use(createCallAnalysisRoutes(teamCallScope))
router.use(callHoldRoutes)

export default router
