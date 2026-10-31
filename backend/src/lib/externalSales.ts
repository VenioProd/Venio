import mongoose, { type ClientSession, type Types } from 'mongoose'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import ProjectPayment from '../models/ProjectPayment.js'
import SalesCommission from '../models/SalesCommission.js'
import type { IBillingDocument, IProjectPayment } from '../types/models/index.js'

/**
 * Commerciaux externes. Toute lecture faite pour un externe passe par ce
 * module : ses leads sont ceux dont il est `externalRep`, ses clients ceux
 * qu'attribue `attributeClients`, ses commissions celles qui portent son id.
 * Le créateur ou l'assigné d'un lead n'ouvre aucun droit : une réattribution
 * retire l'accès à l'ancien commercial dès la requête suivante.
 */
export const EXTERNAL_SALES_ROLE = 'COMMERCIAL_EXTERNE'

/** 10 % du HT encaissé, pour tous les externes (cadrage du 31 octobre 2026). */
export const COMMISSION_RATE_BP = 1000

type Id = string | Types.ObjectId

function objectId(id: Id): Types.ObjectId {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
}

export function repLeadFilter(repId: Id): Record<string, unknown> {
  return { externalRep: objectId(repId) }
}

export function isRepLead(repId: Id, lead: { externalRep?: unknown }): boolean {
  return Boolean(lead.externalRep) && String(lead.externalRep) === String(repId)
}

/**
 * Commercial crédité de chaque client : le titulaire actuel du lead dont la
 * conversion a créé le compte (`User.originLead`). Un lead rattaché ensuite au
 * même compte, par exemple un doublon retrouvé par son email, ne rapporte rien.
 */
export async function attributeClients(
  clientIds: Id[],
  session: ClientSession | null = null,
): Promise<Map<string, { rep: Types.ObjectId; lead: Types.ObjectId }>> {
  const result = new Map<string, { rep: Types.ObjectId; lead: Types.ObjectId }>()
  if (clientIds.length === 0) return result
  const clients = await User.find({ _id: { $in: clientIds.map(objectId) }, role: 'CLIENT', originLead: { $ne: null } })
    .select('originLead')
    .session(session)
    .lean()
  const leads = await Lead.find({
    _id: { $in: clients.map((client) => client.originLead) },
    externalRep: { $ne: null },
  })
    .select('externalRep')
    .session(session)
    .lean()
  for (const client of clients) {
    const origin = leads.find((lead) => String(lead._id) === String(client.originLead))
    if (origin) result.set(String(client._id), { rep: origin.externalRep!, lead: origin._id as Types.ObjectId })
  }
  return result
}

/** Clients signés crédités à ce commercial, avec le lead d'origine. */
export async function repClients(repId: Id): Promise<Map<string, Types.ObjectId>> {
  const leadIds = await Lead.distinct('_id', repLeadFilter(repId))
  const clients = await User.find({ role: 'CLIENT', originLead: { $in: leadIds } })
    .select('originLead')
    .lean()
  return new Map(clients.map((client) => [String(client._id), client.originLead as Types.ObjectId]))
}

/** Arrondi au centime le plus proche, demi vers le haut ; base positive. */
export function commissionCents(htCents: number, rateBp: number = COMMISSION_RATE_BP): number {
  return Math.floor((Math.max(0, htCents) * rateBp + 5000) / 10000)
}

/**
 * Commission d'un mouvement d'encaissement, écrite dans sa transaction. Un
 * remboursement reprend le commercial et le taux de l'encaissement d'origine,
 * et calcule l'écart sur le cumul : rembourser tout ramène la commission à zéro
 * au centime près, même en plusieurs fois.
 */
export async function recordCommission(payment: IProjectPayment, invoice: IBillingDocument, session: ClientSession) {
  if (payment.kind === 'PAYMENT') {
    const origin = (await attributeClients([invoice.client], session)).get(String(invoice.client))
    if (!origin) return null
    // Désactivé, l'externe ne touche plus rien sur les encaissements à venir ;
    // ses commissions déjà constatées, et leurs remboursements, suivent leur cours.
    if (!(await User.exists({ _id: origin.rep, isActive: true }).session(session))) return null
    const [commission] = await SalesCommission.create(
      [
        {
          rep: origin.rep,
          lead: origin.lead,
          client: invoice.client,
          project: invoice.project,
          invoice: invoice._id,
          payment: payment._id,
          kind: 'PAYMENT',
          baseHtCents: payment.htCents,
          rateBp: COMMISSION_RATE_BP,
          amountCents: commissionCents(payment.htCents),
          receivedAt: payment.receivedAt,
        },
      ],
      { session },
    )
    return commission
  }

  const original = await SalesCommission.findOne({ payment: payment.refundOf }).session(session)
  if (!original) return null
  const refunds = await ProjectPayment.find({ refundOf: payment.refundOf, _id: { $ne: payment._id } })
    .select('htCents')
    .session(session)
    .lean()
  const before = original.baseHtCents + refunds.reduce((sum, refund) => sum + refund.htCents, 0)
  const after = before + payment.htCents
  const [commission] = await SalesCommission.create(
    [
      {
        rep: original.rep,
        lead: original.lead,
        client: original.client,
        project: original.project,
        invoice: original.invoice,
        payment: payment._id,
        kind: 'REFUND',
        baseHtCents: payment.htCents,
        rateBp: original.rateBp,
        amountCents: commissionCents(after, original.rateBp) - commissionCents(before, original.rateBp),
        receivedAt: payment.receivedAt,
      },
    ],
    { session },
  )
  return commission
}

/** Totaux par commercial : encaissé HT net, commissions dues et versées. */
export async function commissionTotals(repIds: Id[]) {
  const rows = await SalesCommission.aggregate<{
    _id: { rep: Types.ObjectId; status: 'DUE' | 'PAID' }
    baseHtCents: number
    amountCents: number
  }>([
    { $match: { rep: { $in: repIds.map(objectId) } } },
    {
      $group: {
        _id: { rep: '$rep', status: '$status' },
        baseHtCents: { $sum: '$baseHtCents' },
        amountCents: { $sum: '$amountCents' },
      },
    },
  ])
  const totals = new Map<string, { collectedHtCents: number; dueCents: number; paidCents: number }>()
  for (const id of repIds) totals.set(String(id), { collectedHtCents: 0, dueCents: 0, paidCents: 0 })
  for (const row of rows) {
    const total = totals.get(String(row._id.rep))!
    total.collectedHtCents += row.baseHtCents
    if (row._id.status === 'DUE') total.dueCents += row.amountCents
    else total.paidCents += row.amountCents
  }
  return totals
}
