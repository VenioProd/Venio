import express, { type Request, type Response } from 'express'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import auth from '../../middleware/auth.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()
router.use(auth)
router.use(requirePermission(PERMISSIONS.MANAGE_ADMINS))

router.get('/', async (_req: Request, res: Response) => {
  const mongoState = mongoose.connection.readyState
  const mongoLabels = ['disconnected', 'connected', 'connecting', 'disconnecting']
  const mongoLabel = mongoLabels[mongoState] ?? 'unknown'

  const emailOk = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  const pushOk = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

  const uploadsRoot = path.resolve('uploads')
  let uploadsAccessible = false
  let uploadsWritable = false
  try {
    fs.accessSync(uploadsRoot, fs.constants.F_OK | fs.constants.R_OK)
    uploadsAccessible = true
    fs.accessSync(uploadsRoot, fs.constants.W_OK)
    uploadsWritable = true
  } catch {
    // dossier inexistant ou non accessible
  }

  // Exposer l'état réel des schedulers — voir issue #84.
  // Pour l'instant, ces schedulers sont démarrés au boot dans index.ts (startScheduler,
  // initAutomationEngine, startAutoLockScheduler) et n'exposent pas d'état observable.
  // On renvoie true pour indiquer qu'ils ont été initialisés au démarrage.
  res.json({
    mongo: { state: mongoState, label: mongoLabel, ok: mongoState === 1 },
    email: { configured: emailOk },
    push: { configured: pushOk },
    uploads: { path: uploadsRoot, accessible: uploadsAccessible, writable: uploadsWritable },
    schedulers: {
      crmLegacy: true,
      automationEngine: true,
      accountingAutoLock: true,
    },
    checkedAt: new Date().toISOString(),
  })
})

export default router
