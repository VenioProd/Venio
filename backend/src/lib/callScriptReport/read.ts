import mongoose from 'mongoose'
import CallScriptReport, { type ICallScriptReport } from '../../models/CallScriptReport.js'

/**
 * Lecture des rapports de scripts. Le filtre est posé par l'appelant :
 * l'externe, `{ author: lui }` ; l'équipe, `{ authorKind: 'team', … }`. Les
 * rapports d'un externe ne sont jamais lisibles par l'équipe : ils portent sur
 * des appels de fiches non transmises.
 */
type Populated = Omit<ICallScriptReport, 'author'> & { author: { _id: mongoose.Types.ObjectId; name: string } | null }

function row(report: Populated, me: string) {
  return {
    _id: report._id,
    weekKey: report.weekKey,
    weekStart: report.weekStart,
    weekEnd: report.weekEnd,
    status: report.status,
    skipReason: report.skipReason,
    stats: report.stats,
    author: report.author ? { _id: report.author._id, name: report.author.name } : null,
    own: report.author ? String(report.author._id) === me : false,
  }
}

export async function listReports(filter: Record<string, unknown>, me: string) {
  const reports = await CallScriptReport.find(filter)
    .select('-output -usage')
    .sort({ weekStart: -1, createdAt: -1 })
    .limit(104)
    .populate('author', 'name')
    .lean<Populated[]>()
  return reports.map((r) => row(r, me))
}

export async function readReport(filter: Record<string, unknown>, id: unknown, me: string) {
  if (!mongoose.isObjectIdOrHexString(id)) return null
  const report = await CallScriptReport.findOne({ ...filter, _id: id })
    .populate('author', 'name')
    .lean<Populated>()
  if (!report) return null
  return {
    ...row(report, me),
    output: report.output,
    model: report.model,
    errorCode: report.errorCode,
    retryable: report.retryable,
    nextRetryAt: report.nextRetryAt,
  }
}
