// ─────────────────────────────────────────────────────────────
// onboarding.client_welcome_sequence
// Séquence d'accueil client (email + notification + Nextcloud)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import { sendWelcomeEmail } from '../../lib/email.js'
import { isNextcloudEnabled, createClientFolders } from '../../lib/nextcloud.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const definition: AutomationDefinition = {
  key: 'onboarding.client_welcome_sequence',
  title: "Séquence d'accueil client",
  domain: 'onboarding',
  triggerType: 'event',
  channels: ['in_app', 'email'],
  recipientStrategy: ['client_contact'],
  retryable: true,
  maxRetries: 3,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN', 'ADMIN'],

  buildIdempotencyKey: (ctx) => `onboarding.welcome:${ctx.meta?.clientId}`,

  evaluate: async (ctx) => !!ctx.meta?.clientId,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    const clientId = ctx.meta!.clientId as string
    const client = await User.findById(clientId)

    if (!client) {
      return { actionsExecuted: ['skipped:client_not_found'], recipientsNotified: [] }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const clientName = client.name || client.companyName || 'Client'
    const clientEmail = client.email as string
    const loginUrl = `${process.env.FRONTEND_URL || 'https://app.venio.fr'}/login`

    // Send welcome email
    await sendWelcomeEmail({
      to: clientEmail,
      name: clientName,
      email: clientEmail,
      loginUrl,
    })
    actionsExecuted.push(`welcome_email:${clientId}`)

    // Create in-app notification for client
    await createNotification({
      recipient: (client._id as object).toString(),
      type: 'ONBOARDING' as never,
      title: `Bienvenue sur Venio, ${clientName} !`,
      message: 'Votre espace client est prêt. Vous pouvez consulter vos projets, documents et messages depuis votre tableau de bord.',
      link: '/client/dashboard',
    })
    recipientsNotified.push((client._id as object).toString())
    actionsExecuted.push(`welcome_notification:${clientId}`)

    // Update onboarding status
    client.onboardingStatus = 'EN_COURS'
    await client.save()
    actionsExecuted.push(`onboarding_status:EN_COURS`)

    // Create Nextcloud client folders if enabled
    if (isNextcloudEnabled()) {
      const folderName = client.companyName || client.name || 'Client'
      await createClientFolders(folderName, clientId)
      actionsExecuted.push(`nextcloud_folders:${clientId}`)
    }

    // Notify admins about the new client onboarding
    const admins = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
      isActive: { $ne: false },
    }).select('_id')

    for (const admin of admins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'ONBOARDING' as never,
        title: `Nouveau client onboardé : ${clientName}`,
        message: `Le client ${clientName} (${clientEmail}) a été onboardé avec succès.`,
        link: `/admin/clients/${clientId}`,
      })
      if (!recipientsNotified.includes((admin._id as object).toString())) {
        recipientsNotified.push((admin._id as object).toString())
      }
    }

    return {
      actionsExecuted,
      recipientsNotified,
      details: { clientId, clientName, clientEmail },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
