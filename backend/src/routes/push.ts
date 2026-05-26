import { Router } from 'express'
import requireAuth from '../middleware/auth.js'
import PushSubscription from '../models/PushSubscription.js'
import { getVapidPublicKey } from '../lib/webPush.js'
import logger from '../lib/logger.js'

const router = Router()

// GET /api/push/vapid-public-key
// Public : nécessaire avant subscribe, n'expose que la clé publique
router.get('/vapid-public-key', (_req, res) => {
  const key = getVapidPublicKey()
  if (!key) {
    return res.status(503).json({ error: 'Web Push non configuré' })
  }
  return res.json({ publicKey: key })
})

// POST /api/push/subscriptions
// Body: { endpoint, keys: { p256dh, auth }, userAgent? }
// Upsert : si l'endpoint existe déjà on met juste à jour le user et les keys
router.post('/subscriptions', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body || {}
    if (!endpoint || typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Subscription invalide' })
    }

    const userId = req.user!.id
    const ua = typeof userAgent === 'string' ? userAgent.slice(0, 500) : ''

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: userId,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: ua,
        lastUsedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    return res.json({ subscription: { id: subscription._id } })
  } catch (err) {
    logger.error({ data: err }, '[push] subscribe error')
    return res.status(500).json({ error: 'Erreur enregistrement subscription' })
  }
})

// DELETE /api/push/subscriptions
// Body: { endpoint }
router.delete('/subscriptions', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {}
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ error: 'Endpoint requis' })
    }
    await PushSubscription.deleteOne({ endpoint, user: req.user!.id })
    return res.json({ success: true })
  } catch (err) {
    logger.error({ data: err }, '[push] unsubscribe error')
    return res.status(500).json({ error: 'Erreur suppression subscription' })
  }
})

// GET /api/push/subscriptions/me
// Liste mes abonnements (utile pour la page Paramètres)
router.get('/subscriptions/me', requireAuth, async (req, res) => {
  try {
    const subs = await PushSubscription.find({ user: req.user!.id })
      .select('endpoint userAgent createdAt lastUsedAt')
      .sort('-lastUsedAt')
      .lean()
    return res.json({ subscriptions: subs })
  } catch (err) {
    logger.error({ data: err }, '[push] list error')
    return res.status(500).json({ error: 'Erreur listage subscriptions' })
  }
})

export default router
