import type { ClientSession, Types } from 'mongoose'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'
import type { ILead } from '../types/models/index.js'
import { logLeadActivity } from './crmAutomations.js'
import { notifyUsers } from './notifyHelpers.js'
import { ADMIN_ROLES } from './permissions.js'

/**
 * Passage au closer d'un lead d'externe (`POST /commercial/leads/:id/ready-to-close`),
 * partagé avec l'action `HANDOFF` d'une analyse d'appel : même closer, même
 * écriture, même trace, même notification. L'appelant écrit le patch par
 * `applyLeadChange` en gardant la condition `closingHandoff: null`.
 */

/** Le closer désigné dans les réglages CRM, ou à défaut les super-admins. */
export async function resolveCloser() {
  const settings = await CrmSettings.getSettings()
  if (settings.defaultCloserId) {
    const closer = await User.findOne({ _id: settings.defaultCloserId, role: { $in: ADMIN_ROLES }, isActive: true })
      .select('_id')
      .lean()
    if (closer) return { closer: closer._id as Types.ObjectId, recipients: [closer._id as Types.ObjectId] }
  }
  const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  return { closer: null, recipients: superAdmins.map((admin) => admin._id as Types.ObjectId) }
}

export function closingHandoffPatch(lead: ILead, repId: string, closer: Types.ObjectId | null) {
  return { closingHandoff: { at: new Date(), to: closer, by: repId, repNotes: lead.notes }, assignedTo: closer }
}

export function logClosingHandoff(
  leadId: Types.ObjectId,
  closer: Types.ObjectId | null,
  repId: string,
  session?: ClientSession,
) {
  return logLeadActivity(
    leadId,
    'READY_TO_CLOSE',
    'Dossier transmis pour closing',
    { closerId: closer ? String(closer) : null, fallbackToSuperAdmins: !closer },
    repId,
    session,
  )
}

/** À appeler une fois l'écriture validée. */
export async function notifyClosingHandoff(
  recipients: Types.ObjectId[],
  lead: Pick<ILead, '_id' | 'company'>,
  rep: { id: string; name: string },
): Promise<void> {
  await notifyUsers(recipients, {
    type: 'CRM_LEAD_READY_TO_CLOSE',
    title: 'Lead prêt à closer',
    message: `${lead.company} — transmis par ${rep.name}`,
    link: `/admin/crm/leads/${lead._id}`,
    metadata: { leadId: String(lead._id), externalRepId: rep.id },
  }).catch(() => {})
}
