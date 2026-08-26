import User from '../models/User.js'
import { createNotification } from './notifications.js'
import type { NotificationType } from '../types/enums.js'
import type { Types } from 'mongoose'

interface BroadcastParams {
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
  excludeUserId?: string
  dedupeKey?: string
}

/**
 * Notifie tous les SUPER_ADMIN actifs (sauf l'auteur optionnel).
 */
export async function notifySuperAdmins({
  type,
  title,
  message,
  link,
  metadata,
  excludeUserId,
  dedupeKey,
}: BroadcastParams) {
  const admins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  await Promise.allSettled(
    admins
      .filter((admin) => !excludeUserId || String(admin._id) !== excludeUserId)
      .map((admin) =>
        createNotification({
          recipient: admin._id,
          type,
          title,
          message,
          link,
          metadata,
          dedupeKey,
        }),
      ),
  )
}

/**
 * Notifie tous les admins internes actifs (SUPER_ADMIN + ADMIN + RH + VIEWER).
 */
export async function notifyInternalAdmins({ type, title, message, link, metadata, excludeUserId }: BroadcastParams) {
  const admins = await User.find({
    role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'] },
    isActive: true,
  })
    .select('_id')
    .lean()
  await Promise.allSettled(
    admins
      .filter((admin) => !excludeUserId || String(admin._id) !== excludeUserId)
      .map((admin) =>
        createNotification({
          recipient: admin._id,
          type,
          title,
          message,
          link,
          metadata,
        }),
      ),
  )
}

/**
 * Notifie une liste explicite d'utilisateurs (sauf l'auteur optionnel).
 */
export async function notifyUsers(
  userIds: Array<string | Types.ObjectId | null | undefined>,
  params: Omit<BroadcastParams, 'excludeUserId'> & { excludeUserId?: string },
) {
  const cleanIds = Array.from(
    new Set(userIds.filter((id): id is string | Types.ObjectId => Boolean(id)).map((id) => String(id))),
  ).filter((id) => !params.excludeUserId || id !== params.excludeUserId)

  await Promise.allSettled(
    cleanIds.map((id) =>
      createNotification({
        recipient: id,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        metadata: params.metadata,
      }),
    ),
  )
}
