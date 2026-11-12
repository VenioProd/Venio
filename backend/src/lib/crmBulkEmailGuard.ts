import { logLeadActivity } from './crmAutomations.js'
import { DO_NOT_CONTACT, normalizeEmail, prospectContacts } from './crmPrivacy.js'
import logger from './logger.js'

/**
 * Garde RGPD de l'envoi groupé libre (`POST /api/admin/email-composer/send`).
 *
 * Contrairement à l'envoi depuis la fiche d'un lead, refusé en entier
 * (`routes/admin/interactions.ts`), l'envoi groupé vise des adresses libres :
 * chaque destinataire est contrôlé un par un, les adresses bloquées sont
 * retirées et l'envoi continue pour les autres.
 *
 * Une adresse est bloquée si elle figure dans la liste de suppression
 * (`SUPPRESSION_LIST`) ou si un lead qui la porte est opposé à la prospection
 * (`LEAD`, champ `doNotContact`). Même règle que `checkProspectContact`, en
 * deux requêtes pour tout l'envoi plutôt qu'une par destinataire.
 */
export type BlockedVia = 'LEAD' | 'SUPPRESSION_LIST'

export interface BlockedRecipient {
  email: string
  reason: typeof DO_NOT_CONTACT
  via: BlockedVia
}

export interface RecipientScreening {
  /** Adresses à envoyer, dans l'ordre reçu, sans doublon (forme normalisée). */
  allowed: string[]
  blocked: BlockedRecipient[]
  /** Leads opposés ou dont l'adresse est dans la liste, par adresse normalisée. */
  leadIdsByEmail: Map<string, string[]>
}

export async function screenBulkRecipients(recipients: string[]): Promise<RecipientScreening> {
  const emails = [...new Set(recipients.map(normalizeEmail).filter(Boolean))]
  if (emails.length === 0) return { allowed: [], blocked: [], leadIdsByEmail: new Map() }

  const { suppressed, opposed, leads } = await prospectContacts(emails)
  const leadIdsByEmail = new Map<string, string[]>()
  for (const lead of leads) {
    const email = normalizeEmail(lead.contactEmail)
    if (!emails.includes(email)) continue
    if (lead.doNotContact || suppressed.has(email)) {
      leadIdsByEmail.set(email, [...(leadIdsByEmail.get(email) ?? []), String(lead._id)])
    }
  }

  const allowed: string[] = []
  const blocked: BlockedRecipient[] = []
  for (const email of emails) {
    if (suppressed.has(email)) blocked.push({ email, reason: DO_NOT_CONTACT, via: 'SUPPRESSION_LIST' })
    else if (opposed.has(email)) blocked.push({ email, reason: DO_NOT_CONTACT, via: 'LEAD' })
    else allowed.push(email)
  }
  return { allowed, blocked, leadIdsByEmail }
}

/**
 * Journalise les adresses retirées : une ligne de journal serveur (sans les
 * adresses, données personnelles) et une activité `EMAIL_BLOCKED` sur chaque
 * lead concerné, comme l'envoi depuis la fiche. N'échoue jamais.
 */
export async function logBlockedRecipients(
  screening: RecipientScreening,
  actorId: string | null,
  context: { channel: 'email_composer' },
): Promise<void> {
  if (screening.blocked.length === 0) return
  logger.warn(
    {
      channel: context.channel,
      actorId,
      blockedCount: screening.blocked.length,
      allowedCount: screening.allowed.length,
      via: [...new Set(screening.blocked.map((entry) => entry.via))],
    },
    'Envoi groupé : destinataires « ne pas contacter » retirés',
  )
  for (const entry of screening.blocked) {
    for (const leadId of screening.leadIdsByEmail.get(entry.email) ?? []) {
      await logLeadActivity(
        leadId,
        'EMAIL_BLOCKED',
        'E-mail groupé non envoyé : ne pas contacter',
        { reason: DO_NOT_CONTACT, via: entry.via, channel: context.channel },
        actorId,
      ).catch(() => {})
    }
  }
}
