// ─────────────────────────────────────────────────────────────
// onboarding.internal_user_setup
// Configuration initiale pour un nouvel utilisateur interne
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { registerAutomation } from '../registry.js'
import { createNotification } from '../../lib/notifications.js'
import type { AutomationDefinition, AutomationContext, AutomationResult } from '../types.js'

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RH']

const definition: AutomationDefinition = {
  key: 'onboarding.internal_user_setup',
  title: "Configuration d'un nouvel utilisateur interne",
  domain: 'onboarding',
  triggerType: 'event',
  channels: ['in_app'],
  recipientStrategy: ['super_admins'],
  retryable: true,
  maxRetries: 2,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  buildIdempotencyKey: (ctx) => `onboarding.internal:${ctx.meta?.userId}`,

  evaluate: async (ctx) => !!ctx.meta?.userId,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const User = mongoose.model('User')

    const userId = ctx.meta!.userId as string
    const user = await User.findById(userId)

    if (!user) {
      return { actionsExecuted: ['skipped:user_not_found'], recipientsNotified: [] }
    }

    const actionsExecuted: string[] = []
    const recipientsNotified: string[] = []

    const userName = user.name || 'Utilisateur'
    const userRole = user.role as string

    // Only proceed for admin-like roles
    if (!ADMIN_ROLES.includes(userRole)) {
      return {
        actionsExecuted: ['skipped:not_admin_role'],
        recipientsNotified: [],
        details: { userId, role: userRole },
      }
    }

    // Welcome notification for the new user
    await createNotification({
      recipient: (user._id as object).toString(),
      type: 'ONBOARDING' as never,
      title: `Bienvenue dans l'équipe Venio, ${userName} !`,
      message: 'Votre compte a été configuré. Consultez le tableau de bord pour commencer.',
      link: '/admin/dashboard',
    })
    recipientsNotified.push((user._id as object).toString())
    actionsExecuted.push(`welcome_notification:${userId}`)

    // Notify SUPER_ADMINs about the new team member
    const superAdmins = await User.find({
      role: 'SUPER_ADMIN',
      isActive: { $ne: false },
      _id: { $ne: user._id },
    }).select('_id')

    for (const admin of superAdmins) {
      await createNotification({
        recipient: (admin._id as object).toString(),
        type: 'TEAM_UPDATE' as never,
        title: `Nouveau membre : ${userName} (${userRole})`,
        message: `${userName} a rejoint l'équipe avec le rôle ${userRole}.`,
        link: `/admin/equipe/${userId}`,
      })
      recipientsNotified.push((admin._id as object).toString())
    }

    actionsExecuted.push(`internal_setup:${userId}:${userRole}`)
    console.log(`[ONBOARDING] Internal user setup completed for ${userName} (${userRole})`)

    return {
      actionsExecuted,
      recipientsNotified,
      details: { userId, userName, userRole },
    }
  },
}

export function register() {
  registerAutomation(definition)
}
