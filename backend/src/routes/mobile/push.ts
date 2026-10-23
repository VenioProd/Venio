import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import MobileDevice from '../../models/MobileDevice.js'

const router = Router()
router.use((req, res, next) => {
  if (!req.user!.deviceId) return res.status(403).json({ error: 'Un appareil natif est requis', code: 'DEVICE_REQUIRED' })
  next()
})

router.put('/apns',
  body('token').isString().matches(/^[a-fA-F0-9]{64,200}$/).withMessage('Jeton APNs invalide').toLowerCase(),
  body('environment')
    .isString().withMessage('Environnement APNs invalide').bail()
    .isIn(['sandbox', 'production']).withMessage('Environnement APNs invalide'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0]!.msg, code: 'INVALID_APNS' })
      const filter = {
        _id: req.user!.deviceId,
        userId: req.user!.id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }
      if (!await MobileDevice.exists(filter)) return res.status(403).json({ error: 'Appareil indisponible', code: 'DEVICE_REQUIRED' })
      const { token, environment } = req.body
      await MobileDevice.updateMany(
        { _id: { $ne: req.user!.deviceId }, apnsToken: token },
        { $set: { apnsToken: null, apnsEnvironment: null } },
      )
      const result = await MobileDevice.updateOne(filter, {
        $set: { apnsToken: token, apnsEnvironment: environment, apnsUpdatedAt: new Date() },
      })
      if (!result.matchedCount) return res.status(403).json({ error: 'Appareil indisponible', code: 'DEVICE_REQUIRED' })
      return res.status(204).end()
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
        return res.status(409).json({ error: 'Ce jeton vient d’être enregistré sur un autre appareil', code: 'APNS_TOKEN_CONFLICT' })
      }
      return next(err)
    }
  },
)
router.delete('/apns', async (req, res, next) => {
  try {
    const result = await MobileDevice.updateOne(
      { _id: req.user!.deviceId, userId: req.user!.id, revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { apnsToken: null, apnsEnvironment: null } },
    )
    if (!result.matchedCount) return res.status(403).json({ error: 'Appareil indisponible', code: 'DEVICE_REQUIRED' })
    return res.status(204).end()
  } catch (err) {
    return next(err)
  }
})
export default router
