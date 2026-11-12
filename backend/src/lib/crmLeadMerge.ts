import type { Types } from 'mongoose'
import Lead from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import Interaction from '../models/Interaction.js'
import PersonalTask from '../models/PersonalTask.js'
import CrmRuleRun from '../models/CrmRuleRun.js'
import QuoteProposal from '../models/QuoteProposal.js'
import Project from '../models/Project.js'
import SalesCommission from '../models/SalesCommission.js'
import User from '../models/User.js'
import { logLeadActivity } from './crmAutomations.js'
import { applyLeadChange, deleteLeadCascade, LeadChangeError } from './crmLeadService.js'

type LeadDoc = InstanceType<typeof Lead>

/** Champs texte ou numériques : la cible garde sa valeur, la source ne complète que les vides. */
const FILL_IF_EMPTY = [
  'contactName',
  'contactEmail',
  'contactPhone',
  'source',
  'sourceDetail',
  'project',
  'serviceType',
  'sector',
  'companySize',
  'nextActionLabel',
  'nextActionType',
  'budget',
  'expectedCloseAt',
  'nextActionAt',
  'assignedTo',
  'externalRep',
  'closingHandoff',
  'utm',
  'clientAccountId',
] as const

const isEmpty = (value: unknown): boolean =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0)

const sameId = (a: unknown, b: unknown): boolean => a != null && b != null && String(a) === String(b)

export interface MergeResult {
  lead: LeadDoc
  /** Nombre d'éléments réattachés, par type. */
  moved: {
    activities: number
    interactions: number
    tasks: number
    ruleRuns: number
    quotes: number
    projects: number
    commissions: number
  }
  filledFields: string[]
}

/**
 * Refus de fusion (409), avant toute écriture :
 *  - deux leads gagnés rattachés à des clients différents ;
 *  - une source gagnée dans une cible qui ne l'est pas (son client et ses projets
 *    seraient rattachés à un lead non converti) : il faut fusionner dans le lead gagné.
 */
export function assertMergeable(target: LeadDoc, source: LeadDoc): void {
  if (sameId(target._id, source._id)) {
    throw new LeadChangeError(400, 'MERGE_SAME_LEAD', 'Impossible de fusionner un lead avec lui-même')
  }
  const targetWon = target.status === 'WON'
  const sourceWon = source.status === 'WON'
  if (
    targetWon &&
    sourceWon &&
    target.clientAccountId &&
    source.clientAccountId &&
    !sameId(target.clientAccountId, source.clientAccountId)
  ) {
    throw new LeadChangeError(
      409,
      'MERGE_WON_DIFFERENT_CLIENTS',
      'Les deux leads sont gagnés avec des clients différents : fusion refusée',
    )
  }
  if (sourceWon && !targetWon) {
    throw new LeadChangeError(
      409,
      'MERGE_WON_SOURCE',
      'Le lead à absorber est gagné : fusionnez-le plutôt comme cible, ou fusionnez dans un lead gagné',
    )
  }
}

/**
 * Fusionne `source` dans `target` puis supprime `source`.
 *
 * - La cible garde ses valeurs ; les champs vides sont complétés depuis la source.
 * - Tags : union. Notes : celles de la source sont ajoutées à la suite si elles diffèrent.
 * - Réattachés à la cible : activités, échanges, tâches, exécutions de règles, devis,
 *   projets (CA), commissions et origine des comptes clients.
 * - Une activité MERGED est journalisée sur la cible.
 * - La source est supprimée en dernier (`deleteLeadCascade`, après réattachement) :
 *   un incident en cours de route laisse la source en place et l'opération se relance.
 *
 * Les contrôles d'accès (périmètre d'écriture des deux leads) restent à la route.
 */
export async function mergeLeads(target: LeadDoc, source: LeadDoc, actor: string | null): Promise<MergeResult> {
  assertMergeable(target, source)

  // ── 1. Champs de la cible, par le service ──
  const patch: Record<string, any> = {}
  const filledFields: string[] = []
  for (const field of FILL_IF_EMPTY) {
    if (isEmpty((target as any)[field]) && !isEmpty((source as any)[field])) {
      patch[field] = (source as any)[field]
      filledFields.push(field)
    }
  }
  const tags = [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])]
  if (tags.length !== (target.tags ?? []).length) {
    patch.tags = tags
    filledFields.push('tags')
  }
  const sourceNotes = (source.notes ?? '').trim()
  if (sourceNotes && !(target.notes ?? '').includes(sourceNotes)) {
    const header = `— Notes du lead fusionné « ${source.company} » —`
    patch.notes = [target.notes?.trim(), `${header}\n${sourceNotes}`].filter(Boolean).join('\n\n')
    filledFields.push('notes')
  }
  const sourceInteractionNotes = (source.interactionNotes ?? '').trim()
  if (sourceInteractionNotes && !(target.interactionNotes ?? '').includes(sourceInteractionNotes)) {
    patch.interactionNotes = [target.interactionNotes?.trim(), sourceInteractionNotes].filter(Boolean).join('\n\n')
    filledFields.push('interactionNotes')
  }
  // Dates et compteurs : la plus récente, la somme.
  for (const field of ['lastContactAt', 'lastInteractionAt'] as const) {
    const t = target[field] ? new Date(target[field] as Date).getTime() : 0
    const sDate = source[field] ? new Date(source[field] as Date).getTime() : 0
    if (sDate > t) {
      patch[field] = source[field]
      filledFields.push(field)
    }
  }
  const movedInteractions = await Interaction.countDocuments({ subjectType: 'LEAD', subjectId: source._id })
  if (movedInteractions > 0) {
    patch.interactionsCount = (target.interactionsCount ?? 0) + movedInteractions
  }
  // Une source déjà convertie (cible gagnée) transmet son verrou de conversion seulement si la cible n'a rien.
  if (target.status === 'WON' && !target.wonProcessedAt && source.wonProcessedAt)
    patch.wonProcessedAt = source.wonProcessedAt

  if (Object.keys(patch).length > 0) {
    // « bulk » : pas d'auto-qualification ni d'e-mail ; événements de règles non émis (une fusion n'est pas une modification métier).
    await applyLeadChange(target, patch, { actor, source: 'bulk', emit: false, validateAssignee: false })
  }

  // ── 2. Réattachement ──
  const to = target._id as Types.ObjectId
  const from = source._id as Types.ObjectId
  const count = (r: { modifiedCount?: number }) => r.modifiedCount ?? 0
  const [activities, interactions, tasks, ruleRuns, quotes, projects, commissions] = await Promise.all([
    LeadActivity.updateMany({ leadId: from }, { $set: { leadId: to } }).then(count),
    Interaction.updateMany({ subjectType: 'LEAD', subjectId: from }, { $set: { subjectId: to } }).then(count),
    PersonalTask.updateMany({ leadId: from }, { $set: { leadId: to } }).then(count),
    CrmRuleRun.updateMany({ lead: from }, { $set: { lead: to } }).then(count),
    QuoteProposal.updateMany({ leadId: from }, { $set: { leadId: to } }).then(count),
    Project.updateMany({ sourceLead: from }, { $set: { sourceLead: to } }).then(count),
    SalesCommission.updateMany({ lead: from }, { $set: { lead: to } }).then(count),
    User.updateMany({ originLead: from }, { $set: { originLead: to } }),
  ])
  const moved = { activities, interactions, tasks, ruleRuns, quotes, projects, commissions }

  // ── 3. Trace, puis suppression de la source ──
  await logLeadActivity(
    to,
    'MERGED',
    `Lead « ${source.company} » fusionné dans ce lead`,
    { sourceId: String(from), sourceCompany: source.company, sourceStatus: source.status, filledFields, moved },
    actor,
  )
  await deleteLeadCascade(source)

  const lead = (await Lead.findById(to)) ?? target
  return { lead, moved, filledFields }
}
