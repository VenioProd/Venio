import NotificationPreferences, {
  NOTIFICATION_TYPES,
  defaultChannelPrefs,
  defaultPreferences,
  type ChannelPreferences,
  type NotificationChannel,
} from '../models/NotificationPreferences.js'
import type { NotificationType } from '../types/enums.js'

/**
 * Cache mémoire simple pour éviter de tirer Mongo à chaque createNotification.
 * TTL : 60 s. Invalidation forcée quand l'utilisateur sauve ses prefs.
 */
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { prefs: Record<NotificationType, ChannelPreferences>; expires: number }>()

export function invalidatePreferencesCache(userId: string): void {
  cache.delete(String(userId))
}

export async function getPreferences(userId: string): Promise<Record<NotificationType, ChannelPreferences>> {
  const key = String(userId)
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.prefs

  const doc = await NotificationPreferences.findOne({ user: userId }).lean()
  const stored = (doc?.prefs || {}) as Partial<Record<NotificationType, ChannelPreferences>>

  // Fusion stored + defaults : si une catégorie manque, on l'autorise par défaut
  const merged = {} as Record<NotificationType, ChannelPreferences>
  for (const type of NOTIFICATION_TYPES) {
    merged[type] = { ...defaultChannelPrefs(), ...(stored[type] || {}) }
  }

  cache.set(key, { prefs: merged, expires: Date.now() + CACHE_TTL_MS })
  return merged
}

export async function shouldNotify(userId: string, type: NotificationType, channel: NotificationChannel): Promise<boolean> {
  try {
    const prefs = await getPreferences(userId)
    return prefs[type]?.[channel] !== false
  } catch {
    // En cas d'erreur, on n'empêche pas la notif (fail-open).
    return true
  }
}

export async function setPreferences(
  userId: string,
  next: Partial<Record<NotificationType, Partial<ChannelPreferences>>>
): Promise<Record<NotificationType, ChannelPreferences>> {
  // Charge l'existant et merge
  const current = await getPreferences(userId)
  const merged = {} as Record<NotificationType, ChannelPreferences>
  for (const type of NOTIFICATION_TYPES) {
    merged[type] = { ...current[type], ...(next[type] || {}) }
  }

  await NotificationPreferences.findOneAndUpdate(
    { user: userId },
    { user: userId, prefs: merged },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  invalidatePreferencesCache(userId)
  return merged
}

export { NOTIFICATION_TYPES, defaultPreferences, type ChannelPreferences, type NotificationChannel }
