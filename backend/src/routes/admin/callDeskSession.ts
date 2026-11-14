import express, { type NextFunction, type Request, type Response } from 'express'
import type { CallDeskScope } from '../../lib/callDeskScope.js'
import { parisParts, parisWallTimeToDate } from '../../automation/jobs/crmParisTime.js'
import CrmSettings from '../../models/CrmSettings.js'
import Interaction from '../../models/Interaction.js'
import Lead from '../../models/Lead.js'

/**
 * Séance du jour de l'utilisateur (« Votre séance » d'Aujourd'hui, carte
 * « Aujourd'hui » du poste d'appel) : ses appels consignés depuis minuit,
 * heure de Paris, sur les fiches de son périmètre d'appel (`scope` : équipe ou
 * commercial externe, voir `lib/callDeskScope.ts`), comptés comme le rapport
 * des scripts (joint : résultat `reached` ; rendez-vous : effet `MEETING` ;
 * conversion sur joints). Seulement des nombres, seulement ses appels.
 */

/** Bornes du jour de Paris qui contient `now`. */
export function parisDayRange(now: Date): { day: string; start: Date; end: Date } {
  const today = parisParts(now)
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1))
  return {
    day: today.dateKey,
    start: parisWallTimeToDate(today.year, today.month, today.day, 0),
    end: parisWallTimeToDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0),
  }
}

export function createCallDeskSessionRoutes(scope: CallDeskScope) {
  const router = express.Router()

  router.get('/session', scope.read, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { day, start, end } = parisDayRange(new Date())
      const logged = await Interaction.find({
        kind: 'CALL',
        subjectType: 'LEAD',
        author: req.user!.id,
        occurredAt: { $gte: start, $lt: end },
      })
        .select('subjectId outcome')
        .lean()
      const leadIds = [...new Set(logged.map((item) => String(item.subjectId)))]
      const allowed = new Set(
        leadIds.length
          ? (await Lead.find({ _id: { $in: leadIds }, $and: [scope.leadFilter(req)] }).distinct('_id')).map(String)
          : [],
      )
      const settings = await CrmSettings.getSettings()
      const outcomes = new Map(settings.callOutcomes.map((outcome) => [outcome.value, outcome]))
      let calls = 0
      let reached = 0
      let meetings = 0
      for (const item of logged) {
        if (!allowed.has(String(item.subjectId))) continue
        const outcome = outcomes.get(item.outcome ?? '')
        calls++
        if (outcome?.reached) reached++
        if (outcome?.effect === 'MEETING') meetings++
      }
      return res.json({
        day,
        calls,
        reached,
        meetings,
        conversionRate: reached > 0 ? Math.round((meetings / reached) * 100) : null,
        targetConversionRate: settings.callScriptReport?.targetConversionRate ?? null,
      })
    } catch (err) {
      return next(err)
    }
  })

  return router
}
