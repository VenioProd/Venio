import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import { createClientFolders } from './nextcloud.js'
import { autoCreateProjectFromLead, logLeadActivity } from './crmAutomations.js'
import logger from './logger.js'

export async function ensureClientForWonLead(
  lead: any,
  actorId: string | null = null,
  enableActivityLog: boolean = true,
): Promise<any> {
  if (!lead || lead.status !== 'WON') return null

  const normalizedEmail = (lead.contactEmail || '').trim().toLowerCase()
  let client: any = null
  let didCreateClient = false
  let didLinkClient = false

  if (lead.clientAccountId) {
    client = await User.findOne({ _id: lead.clientAccountId, role: 'CLIENT' })
  }

  if (!client && normalizedEmail) {
    client = await User.findOne({ email: normalizedEmail, role: 'CLIENT' })
  }

  if (client) {
    const updatePayload: Record<string, any> = {}

    if (!client.companyName && lead.company) updatePayload.companyName = lead.company
    if (!client.serviceType && lead.serviceType) updatePayload.serviceType = lead.serviceType
    if (!client.phone && lead.contactPhone) updatePayload.phone = lead.contactPhone
    // Pas de propriétaire attribué à un compte existant : la propriété d'un
    // client ouvre des droits (devis), et le lier par son email ne prouve rien.
    if (!client.name && (lead.contactName || lead.company)) {
      updatePayload.name = lead.contactName || lead.company
    }

    if (Object.keys(updatePayload).length > 0) {
      client = await User.findByIdAndUpdate(client._id, { $set: updatePayload }, { new: true })
    }
  } else {
    const passwordHash = await bcrypt.hash(`crm-autogen-${lead._id}-${Date.now()}`, 10)
    client = await User.create({
      email: normalizedEmail || `client-${lead._id}@placeholder.local`,
      passwordHash,
      name: lead.contactName || lead.company,
      companyName: lead.company,
      serviceType: lead.serviceType || '',
      phone: lead.contactPhone || '',
      role: 'CLIENT',
      source: lead.source ? mapLeadSourceToClientSource(lead.source) : 'AUTRE',
      status: 'ACTIF',
      onboardingStatus: 'A_FAIRE',
      healthStatus: 'BON',
      ownerAdminId: lead.assignedTo || actorId || null,
      originLead: lead._id,
    })
    didCreateClient = true

    // Create Nextcloud folders for the new client (fire-and-forget)
    createClientFolders(client.companyName || client.name, client._id.toString()).catch((err: Error) => {
      logger.error({ data: err.message || err }, '[Nextcloud] Error creating client folders from CRM:')
    })
  }

  if (!lead.clientAccountId || lead.clientAccountId.toString() !== client._id.toString()) {
    lead.clientAccountId = client._id
    await lead.save()
    didLinkClient = true
  }

  if (enableActivityLog && (didCreateClient || didLinkClient)) {
    await logLeadActivity(
      lead._id,
      'CONVERTED',
      `Lead converti en client: ${client.name}`,
      { clientId: client._id },
      actorId,
    )
  }

  return client
}

/**
 * Projet issu d'un lead gagné, créé une seule fois : un lead n'a qu'un projet
 * « auto-crm ». Rend `null` si un projet est déjà rattaché au lead ou s'il
 * n'a pas de compte client.
 */
export async function ensureProjectForWonLead(lead: any, actorId: string | null = null): Promise<any> {
  if (!lead || lead.status !== 'WON') return null
  if (await Project.exists({ sourceLead: lead._id })) return null
  return autoCreateProjectFromLead(lead, actorId)
}

export interface WonLeadOutcome {
  /** Vrai si ce passage a obtenu le verrou et mené la conversion. */
  processed: boolean
  client: any
  project: any
}

/**
 * Conversion d'un lead gagné (compte client + projet), au plus une fois.
 *
 * Plusieurs chemins mènent à WON (fiche admin, action groupée, API agent,
 * règle d'automatisation) et peuvent se croiser : le verrou est pris par une
 * mise à jour conditionnelle atomique sur `wonProcessedAt`. Un seul appel
 * l'obtient ; les autres rendent `processed: false` sans rien créer. En cas
 * d'échec, le verrou est relâché pour qu'un passage ultérieur à WON réessaie.
 *
 * `wonProcessedAt` est déclaré dans le schéma Lead (`models/Lead.ts`, défaut
 * `null`) : les écritures passent par le schéma, sans `strict: false`.
 */
export async function processWonLead(
  lead: any,
  actorId: string | null = null,
  enableActivityLog: boolean = true,
): Promise<WonLeadOutcome> {
  const none: WonLeadOutcome = { processed: false, client: null, project: null }
  if (!lead || lead.status !== 'WON') return none

  const claimed = await Lead.findOneAndUpdate(
    { _id: lead._id, status: 'WON', wonProcessedAt: null },
    { $set: { wonProcessedAt: new Date() } },
    { new: true, projection: { _id: 1 } },
  ).lean()
  if (!claimed) return none

  const release = () =>
    Lead.updateOne({ _id: lead._id }, { $set: { wonProcessedAt: null } }).catch(() => undefined)

  let client: any
  try {
    client = await ensureClientForWonLead(lead, actorId, enableActivityLog)
  } catch (err) {
    await release()
    throw err
  }

  let project: any = null
  try {
    project = await ensureProjectForWonLead(lead, actorId)
  } catch (err) {
    // Le compte client est créé : l'échec du projet ne doit pas faire échouer
    // la mise à jour du lead. Le verrou relâché permet de retenter plus tard.
    logger.warn({ data: (err as Error).message }, '[crm] Échec de création du projet du lead gagné')
    await release()
  }
  return { processed: true, client, project }
}

// Helper to map lead source to client source enum
function mapLeadSourceToClientSource(leadSource: string): string {
  const sourceMap: Record<string, string> = {
    Ads: 'INBOUND',
    Site: 'INBOUND',
    Referral: 'REFERRAL',
    'Réseaux sociaux': 'INBOUND',
    Email: 'OUTBOUND',
    Autre: 'AUTRE',
  }
  return sourceMap[leadSource] || 'AUTRE'
}

