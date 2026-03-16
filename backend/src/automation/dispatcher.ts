// ─────────────────────────────────────────────────────────────
// Notification Dispatcher — multi-channel delivery
// ─────────────────────────────────────────────────────────────

import { createNotification } from '../lib/notifications.js'
import type { DispatchPayload, DispatchTarget, Channel } from './types.js'

/**
 * Dispatch notifications to all targets across their channels.
 * Returns list of successfully notified recipient IDs.
 */
export async function dispatch(payload: DispatchPayload): Promise<string[]> {
  const notified: string[] = []

  for (const target of payload.targets) {
    try {
      if (target.channel === 'in_app') {
        await createNotification({
          recipient: target.userId,
          type: 'AUTOMATION' as never,
          title: payload.title,
          message: payload.message,
          link: payload.link,
          metadata: {
            automationKey: payload.automationKey,
            ...payload.metadata,
          },
        })
        notified.push(target.userId)
      } else if (target.channel === 'email' && target.email) {
        // Email dispatch is handled by individual jobs calling specific templates
        // This is a fallback for generic notifications
        notified.push(target.userId)
      } else if (target.channel === 'system_log') {
        console.log(
          `[AUTOMATION] ${payload.automationKey}: ${payload.title} → ${target.name || target.userId}`
        )
        notified.push(target.userId)
      }
    } catch (err) {
      console.error(
        `[AUTOMATION] dispatch failed for ${target.userId} on ${target.channel}:`,
        (err as Error).message
      )
    }
  }

  return [...new Set(notified)]
}

/**
 * Resolve recipients: get admin users by strategy.
 */
export async function resolveRecipients(
  strategy: string,
  context?: Record<string, unknown>
): Promise<DispatchTarget[]> {
  // Lazy import to avoid circular deps
  const mongoose = await import('mongoose')
  const User = mongoose.default.model('User')

  const targets: DispatchTarget[] = []

  switch (strategy) {
    case 'admins': {
      const admins = await User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: { $ne: false },
      }).select('_id email name')
      for (const a of admins) {
        targets.push({
          userId: a._id.toString(),
          email: a.email,
          name: a.name,
          channel: 'in_app',
        })
      }
      break
    }
    case 'super_admins': {
      const sas = await User.find({
        role: 'SUPER_ADMIN',
        isActive: { $ne: false },
      }).select('_id email name')
      for (const s of sas) {
        targets.push({
          userId: s._id.toString(),
          email: s.email,
          name: s.name,
          channel: 'in_app',
        })
      }
      break
    }
    case 'assigned_user': {
      if (context?.assignedUserId) {
        const u = await User.findById(context.assignedUserId).select('_id email name')
        if (u) {
          targets.push({
            userId: u._id.toString(),
            email: u.email,
            name: u.name,
            channel: 'in_app',
          })
        }
      }
      break
    }
    case 'project_manager': {
      if (context?.projectManagerId) {
        const u = await User.findById(context.projectManagerId).select('_id email name')
        if (u) {
          targets.push({
            userId: u._id.toString(),
            email: u.email,
            name: u.name,
            channel: 'in_app',
          })
        }
      }
      break
    }
    case 'lead_owner': {
      if (context?.leadOwnerId) {
        const u = await User.findById(context.leadOwnerId).select('_id email name')
        if (u) {
          targets.push({
            userId: u._id.toString(),
            email: u.email,
            name: u.name,
            channel: 'in_app',
          })
        }
      }
      break
    }
    case 'client_contact': {
      if (context?.clientId) {
        const u = await User.findById(context.clientId).select('_id email name')
        if (u) {
          targets.push({
            userId: u._id.toString(),
            email: u.email,
            name: u.name,
            channel: 'in_app',
          })
        }
      }
      break
    }
    case 'all_internal_active': {
      const users = await User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'] },
        isActive: { $ne: false },
      }).select('_id email name')
      for (const u of users) {
        targets.push({
          userId: u._id.toString(),
          email: u.email,
          name: u.name,
          channel: 'in_app',
        })
      }
      break
    }
    default:
      break
  }

  return targets
}
