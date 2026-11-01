import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { createClientFolders } from './nextcloud.js'
import { logLeadActivity } from './crmAutomations.js'
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

