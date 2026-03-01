import express, { Request, Response, NextFunction } from 'express'
import { TOTP } from 'otpauth'
import QRCode from 'qrcode'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import User from '../../models/User.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// POST /api/admin/2fa/setup — Generate TOTP secret and QR code
router.post('/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA déjà activé' })
    }

    // Generate a random base32 secret
    const bytes = new Uint8Array(20)
    crypto.getRandomValues(bytes)
    const secret = Buffer.from(bytes).toString('base64url').slice(0, 20).toUpperCase()

    const totp = new TOTP({
      issuer: 'Venio',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    })

    const otpauthUrl = totp.toString()
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl)

    // Store secret temporarily (not yet enabled)
    user.twoFactorSecret = secret
    await user.save()

    return res.json({ secret, qrDataUrl })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/verify — Verify TOTP code and enable 2FA
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code requis' })

    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    if (!user.twoFactorSecret) return res.status(400).json({ error: 'Aucune configuration 2FA en cours' })

    const totp = new TOTP({
      issuer: 'Venio',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.twoFactorSecret,
    })

    const delta = totp.validate({ token: String(code), window: 1 })
    if (delta === null) {
      return res.status(400).json({ error: 'Code invalide' })
    }

    user.twoFactorEnabled = true
    await user.save()

    return res.json({ enabled: true })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/2fa/disable — Disable 2FA
router.post('/disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    user.twoFactorSecret = null
    user.twoFactorEnabled = false
    await user.save()

    return res.json({ enabled: false })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/2fa/status — Check if 2FA is enabled
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })
    return res.json({ enabled: user.twoFactorEnabled })
  } catch (err) {
    return next(err)
  }
})

export default router
