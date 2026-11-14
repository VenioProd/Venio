import express, { type NextFunction, type Request, type Response } from 'express'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { applyEntityQuery, leadScopeFilter, teamLeadFilter } from '../../lib/crmScope.js'
import { EXTERNAL_SALES_ROLE } from '../../lib/externalSales.js'
import { parisParts, parisWallTimeToDate } from '../../automation/jobs/crmParisTime.js'
import CrmSettings from '../../models/CrmSettings.js'
import Interaction from '../../models/Interaction.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'

/**
 * Activité d'appels du pilotage (Piloter › Prévisions et objectifs) : appels
 * consignés par jour de Paris sur les 14 derniers jours, et part des appels
 * décrochés (résultat `reached`), sur le périmètre de `GET /pilotage` (lecture
 * du CRM, hors listes d'appel des externes non transmises, `?entity=`). Un
 * appel d'un commercial externe ne compte que sur une fiche transmise au
 * closer, comme pour `teamCallScope`. Seulement des nombres.
 */
const router = express.Router()

export const CALL_ACTIVITY_DAYS = 14

/** Jours de Paris (`YYYY-MM-DD`) des `count` derniers jours, aujourd'hui compris, et leurs bornes. */
export function parisDays(now: Date, count: number): { days: string[]; start: Date; end: Date } {
  const today = parisParts(now)
  const at = (offset: number) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Array.from({ length: count }, (_, index) => {
    const d = at(index - count + 1)
    return `${d.year}-${pad(d.month)}-${pad(d.day)}`
  })
  const first = at(1 - count)
  const next = at(1)
  return {
    days,
    start: parisWallTimeToDate(first.year, first.month, first.day, 0),
    end: parisWallTimeToDate(next.year, next.month, next.day, 0),
  }
}

router.get(
  '/pilotage/call-activity',
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { days, start, end } = parisDays(new Date(), CALL_ACTIVITY_DAYS)
      const scope: Record<string, unknown> = { ...leadScopeFilter(req), $and: [teamLeadFilter()] }
      applyEntityQuery(req, scope, req.query.entity)

      const logged = await Interaction.find({
        kind: 'CALL',
        subjectType: 'LEAD',
        occurredAt: { $gte: start, $lt: end },
      })
        .select('subjectId author outcome occurredAt')
        .lean()
      const leadIds = [...new Set(logged.map((item) => String(item.subjectId)))]
      const authorIds = [...new Set(logged.flatMap((item) => (item.author ? [String(item.author)] : [])))]
      const [leads, externals, settings] = await Promise.all([
        leadIds.length
          ? Lead.find({ _id: { $in: leadIds }, ...scope })
              .select('closingHandoff externalRep')
              .lean()
          : [],
        authorIds.length ? User.find({ _id: { $in: authorIds }, role: EXTERNAL_SALES_ROLE }).distinct('_id') : [],
        CrmSettings.getSettings(),
      ])
      const leadById = new Map(leads.map((lead) => [String(lead._id), lead]))
      const external = new Set(externals.map(String))
      const reachedOutcomes = new Set(settings.callOutcomes.filter((item) => item.reached).map((item) => item.value))

      const perDay = new Map(days.map((day) => [day, { day, calls: 0, reached: 0 }]))
      for (const item of logged) {
        const lead = leadById.get(String(item.subjectId))
        if (!lead) continue
        const author = item.author ? String(item.author) : ''
        const byExternal = external.has(author) || (lead.externalRep && author === String(lead.externalRep))
        if (byExternal && !lead.closingHandoff) continue
        const row = perDay.get(parisParts(item.occurredAt).dateKey)
        if (!row) continue
        row.calls++
        if (reachedOutcomes.has(item.outcome ?? '')) row.reached++
      }
      const series = [...perDay.values()]
      const calls = series.reduce((sum, row) => sum + row.calls, 0)
      const reached = series.reduce((sum, row) => sum + row.reached, 0)
      return res.json({
        days: series,
        calls,
        reached,
        reachedRate: calls > 0 ? Math.round((reached / calls) * 100) : null,
      })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
