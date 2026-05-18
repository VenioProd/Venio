import { Router } from 'express'
import requireAuth from '../middleware/auth.js'
import {
  getPreferences,
  setPreferences,
  NOTIFICATION_TYPES,
  type ChannelPreferences,
} from '../lib/notificationPreferences.js'
import type { NotificationType } from '../types/enums.js'

const router = Router()

// GET /api/notification-preferences
router.get('/', requireAuth, async (req, res) => {
  try {
    const prefs = await getPreferences(req.user!.id)
    return res.json({ preferences: prefs, types: NOTIFICATION_TYPES })
  } catch (err) {
    console.error('[notif-prefs] get error', err)
    return res.status(500).json({ error: 'Erreur lecture préférences' })
  }
})

// PATCH /api/notification-preferences
// Body: { preferences: Partial<Record<NotificationType, Partial<ChannelPreferences>>> }
router.patch('/', requireAuth, async (req, res) => {
  try {
    const payload = req.body?.preferences
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Payload invalide' })
    }

    // Filtrage : on ne garde que les types connus et les champs valides
    const next: Partial<Record<NotificationType, Partial<ChannelPreferences>>> = {}
    for (const type of NOTIFICATION_TYPES) {
      const entry = payload[type]
      if (!entry || typeof entry !== 'object') continue
      const filtered: Partial<ChannelPreferences> = {}
      if (typeof entry.inApp === 'boolean') filtered.inApp = entry.inApp
      if (typeof entry.push === 'boolean') filtered.push = entry.push
      if (typeof entry.email === 'boolean') filtered.email = entry.email
      if (Object.keys(filtered).length > 0) next[type] = filtered
    }

    const merged = await setPreferences(req.user!.id, next)
    return res.json({ preferences: merged })
  } catch (err) {
    console.error('[notif-prefs] patch error', err)
    return res.status(500).json({ error: 'Erreur écriture préférences' })
  }
})

export default router
