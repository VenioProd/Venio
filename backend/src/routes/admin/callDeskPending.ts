import express, { type NextFunction, type Request, type Response } from 'express'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { leadWriteScopeFilter } from '../../lib/crmScope.js'
import { readableAuthors, teamCallScope } from '../../lib/callDeskScope.js'
import Call from '../../models/Call.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'

/**
 * Ce qui attend une décision de l'utilisateur, pour l'écran « Aujourd'hui » du
 * CRM (lecture seule, refonte du 14 nov. 2026) :
 * - les analyses d'appel `READY` qu'il peut valider : exactement celles que
 *   `POST /calls/:id/analysis/apply` lui ouvre (`teamCallScope` et
 *   `readableAuthors` : les siennes sur une fiche de son périmètre, et celles
 *   de l'externe d'une fiche transmise au closer) ;
 * - les fiches retenues pour opposition sur lesquelles il peut décider :
 *   exactement celles de `callHold.ts` (toute fiche où il écrit).
 * `MANAGE_CRM` exigé, comme pour valider et décider. Aucun contenu d'appel :
 * ni transcript, ni sortie d'analyse, ni citation (la décision la relit par
 * `GET /leads/:id/call-hold`) ; pour une retenue, ni l'appel, ni sa durée.
 */
const router = express.Router()

/** Au-delà, l'écran renvoie au poste d'appel ; le total reste exact. */
const LIST_LIMIT = 100

type Named = { _id: unknown; name?: string }

async function namesById(ids: unknown[]): Promise<Map<string, { _id: string; name: string }>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))]
  const users = unique.length
    ? await User.find({ _id: { $in: unique } })
        .select('name')
        .lean<Named[]>()
    : []
  return new Map(users.map((user) => [String(user._id), { _id: String(user._id), name: user.name ?? '' }]))
}

async function pendingAnalyses(req: Request) {
  // Fiches qui portent une analyse prête, restreintes au périmètre du poste d'appel de l'équipe.
  const leadIds = await CallAnalysis.distinct('lead', { status: 'READY' })
  if (leadIds.length === 0) return { items: [], total: 0 }
  const leads = await Lead.find({ _id: { $in: leadIds }, $and: [teamCallScope.leadFilter(req)] })
    .select('company closingHandoff externalRep')
    .lean()
  if (leads.length === 0) return { items: [], total: 0 }
  const filter = {
    status: 'READY',
    $or: leads.map((lead) => ({
      lead: lead._id,
      author: { $in: readableAuthors(req, teamCallScope, lead) },
    })),
  }
  const [rows, total] = await Promise.all([
    CallAnalysis.find(filter)
      .select('call lead author callDate durationSec')
      .sort({ callDate: -1, _id: -1 })
      .limit(LIST_LIMIT)
      .lean(),
    CallAnalysis.countDocuments(filter),
  ])
  const company = new Map(leads.map((lead) => [String(lead._id), lead.company]))
  const authors = await namesById(rows.map((row) => row.author))
  return {
    total,
    items: rows.map((row) => ({
      callId: String(row.call),
      leadId: String(row.lead),
      company: company.get(String(row.lead)) ?? '',
      callDate: row.callDate,
      durationSec: row.durationSec ?? null,
      author: authors.get(String(row.author)) ?? null,
    })),
  }
}

async function pendingHolds(req: Request) {
  const filter = { callHold: { $ne: null }, $and: [leadWriteScopeFilter(req)] }
  const [leads, total] = await Promise.all([
    Lead.find(filter).select('company callHold').sort({ 'callHold.at': -1, _id: -1 }).limit(LIST_LIMIT).lean(),
    Lead.countDocuments(filter),
  ])
  // L'auteur de l'appel, comme `GET /leads/:id/call-hold` ; l'appel lui-même ne sort pas.
  const calls = await Call.find({ _id: { $in: leads.map((lead) => lead.callHold?.call).filter(Boolean) } })
    .select('author')
    .lean()
  const callAuthor = new Map(calls.map((call) => [String(call._id), String(call.author)]))
  const authors = await namesById(calls.map((call) => call.author))
  return {
    total,
    items: leads.map((lead) => ({
      leadId: String(lead._id),
      company: lead.company,
      at: lead.callHold!.at,
      author: authors.get(callAuthor.get(String(lead.callHold!.call)) ?? '') ?? null,
    })),
  }
}

router.get(
  '/pending',
  requirePermission(PERMISSIONS.MANAGE_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [analyses, holds] = await Promise.all([pendingAnalyses(req), pendingHolds(req)])
      return res.json({
        analyses: analyses.items,
        analysesTotal: analyses.total,
        holds: holds.items,
        holdsTotal: holds.total,
      })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
