import { apiFetch } from '../lib/api'
import type { AppNotification } from '../types/notification.types'

export async function fetchNotifications(): Promise<AppNotification[]> {
  const res = (await apiFetch('/api/admin/notifications')) as { notifications: AppNotification[] }
  return res.notifications
}

export async function fetchUnreadCount(): Promise<number> {
  const res = (await apiFetch('/api/admin/notifications/unread-count')) as { count: number }
  return res.count
}

export async function markAsRead(id: string): Promise<AppNotification> {
  const res = (await apiFetch(`/api/admin/notifications/${id}/read`, {
    method: 'PATCH',
  })) as { notification: AppNotification }
  return res.notification
}

export async function markAllAsRead(): Promise<void> {
  await apiFetch('/api/admin/notifications/read-all', {
    method: 'POST',
  })
}

export type NotificationView = 'active' | 'archived'

/** Toutes mes notifications (jusqu'à 200), actives ou archivées. */
export async function fetchAllNotifications(
  view: NotificationView,
): Promise<{ notifications: AppNotification[]; total: number }> {
  return apiFetch(`/api/admin/notifications/all?view=${view}&limit=200`)
}

/** Supprime mes notifications lues de la vue donnée ; renvoie le nombre supprimé. */
export async function deleteReadNotifications(view: NotificationView): Promise<number> {
  const res = (await apiFetch('/api/admin/notifications/delete-read', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ view }),
  })) as { deleted: number }
  return res.deleted
}
