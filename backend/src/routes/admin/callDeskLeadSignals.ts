import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose, { type Types } from 'mongoose'
import { userHasPermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { leadScopeFilter, teamLeadFilter } from '../../lib/crmScope.js'
import { readableAuthors, teamCallScope } from '../../lib/callDeskScope.js'
import { callWindowCheck } from '../../lib/callGuards.js'
import { EXTERNAL_SALES_ROLE } from '../../lib/externalSales.js'
import CallAnalysis from '../../models/CallAnalysis.js'
import CrmSettings from '../../models/CrmSettings.js'
import Interaction from '../../models/Interaction.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'

/**
 * Signaux d'appel des fiches du pipeline et de la fiche lead de l'équipe
 * (lecture seule, `VIEW_CRM`). Les fiches lues sont celles de la liste du
 * pipeline (`leadScopeFilter` et `teamLeadFilter`, comme `GET /crm/pipeline`).
 * - `GET /lead-signals?ids=` : parmi ces fiches, celles qui portent une analyse
 *   `READY` que l'appelant peut valider (règle exacte de `GET /pending` :
 *   `teamCallScope` et `readableAuthors`, `MANAGE_CRM` exigé, sinon aucune), et
 *   celles dont le dernier résultat d'appel a l'effet `VOICEMAIL`. Un appel
 *   d'externe ne compte que sur une fiche transmise au closer.
 * - `GET /leads/:id/call-check` : pays, fuseaux et blocage d'appel du moment
 *   (`callWindowCheck`, comme la file du poste d'appel), sans aucun appel lu.
 * Rien du contenu des appels ne sort : seulement des identifiants de fiche.
 */
const router = express.Router()

/** Une page du tableau, au plus ; le navigateur découpe au-delà. */
const MAX_IDS = 100

function parseIds(raw: unknown): Types.ObjectId[] | null {
  if (typeof raw !== 'string' || !raw) return []
  const ids = [...new Set(raw.split(','))]
  if (ids.length > MAX_IDS || !ids.every((id) => mongoose.isObjectIdOrHexString(id))) return null
  return ids.map((id) => new mongoose.Types.ObjectId(id))
}

const listFilter = (req: Request) => ({ ...leadScopeFilter(req), $and: [teamLeadFilter()] })

async function analysisReady(req: Request, ids: Types.ObjectId[]): Promise<string[]> {
  if (!(await userHasPermission(req, PERMISSIONS.MANAGE_CRM))) return []
  const leads = await Lead.find({ _id: { $in: ids }, $and: [listFilter(req), teamCallScope.leadFilter(req)] })
    .select('closingHandoff externalRep')
    .lean()
  if (leads.length === 0) return []
  const found = await CallAnalysis.distinct('lead', {
    status: 'READY',
    $or: leads.map((lead) => ({ lead: lead._id, author: { $in: readableAuthors(req, teamCallScope, lead) } })),
  })
  return found.map(String)
}

async function voicemail(req: Request, ids: Types.ObjectId[]): Promise<string[]> {
  const settings = await CrmSettings.getSettings()
  const outcomes = settings.callOutcomes.filter((item) => item.effect === 'VOICEMAIL').map((item) => item.value)
  if (outcomes.length === 0) return []
  const leads = await Lead.find({ _id: { $in: ids }, ...listFilter(req) })
    .select('closingHandoff externalRep')
    .lean()
  if (leads.length === 0) return []
  const externals = await User.distinct('_id', { role: EXTERNAL_SALES_ROLE })
  const handedOff = leads.filter((lead) => lead.closingHandoff && lead.externalRep)
  // L'aggregate ne caste rien : identifiants déjà en ObjectId.
  const last = await Interaction.aggregate<{ _id: Types.ObjectId; outcome: string }>([
    {
      $match: {
        subjectType: 'LEAD',
        subjectId: { $in: leads.map((lead) => lead._id) },
        kind: 'CALL',
        outcome: { $nin: ['', null] },
        $or: [
          { author: { $nin: externals } },
          ...handedOff.map((lead) => ({ subjectId: lead._id, author: lead.externalRep })),
        ],
      },
    },
    { $sort: { occurredAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: '$subjectId', outcome: { $first: '$outcome' } } },
  ])
  return last.filter((row) => outcomes.includes(row.outcome)).map((row) => String(row._id))
}

router.get('/lead-signals', teamCallScope.read, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = parseIds(req.query.ids)
    if (!ids) return res.status(400).json({ error: `Jusqu'à ${MAX_IDS} identifiants de fiche` })
    if (ids.length === 0) return res.json({ analysisReady: [], voicemail: [] })
    const [ready, voicemailIds] = await Promise.all([analysisReady(req, ids), voicemail(req, ids)])
    return res.json({ analysisReady: ready, voicemail: voicemailIds })
  } catch (err) {
    return next(err)
  }
})

router.get('/leads/:id/call-check', teamCallScope.read, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lead = mongoose.isObjectIdOrHexString(req.params.id)
      ? await Lead.findOne({ _id: req.params.id, ...listFilter(req) })
          .select('contactPhone businessContact')
          .lean()
      : null
    if (!lead) return res.status(404).json({ error: 'Lead not found' })
    const { target, block } = callWindowCheck(lead, await CrmSettings.getSettings(), new Date())
    return res.json({ callCheck: { country: target?.country ?? null, timeZones: target?.timeZones ?? [], block } })
  } catch (err) {
    return next(err)
  }
})

export default router
