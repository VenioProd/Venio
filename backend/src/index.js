import dotenv from 'dotenv'
import mongoose from 'mongoose'

import { createApp } from './createApp.js'
import User from './models/User.js'
import { startAutoLockScheduler } from './lib/accounting/autoLock.js'

dotenv.config()

const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI

if (!mongoUri) {
  throw new Error('MONGODB_URI is required')
}

mongoose
  .connect(mongoUri)
  .then(() => {
    return User.exists({ role: 'SUPER_ADMIN' }).then(async (hasSuperAdmin) => {
      if (hasSuperAdmin) return
      await User.updateMany({ role: 'ADMIN' }, { $set: { role: 'SUPER_ADMIN' } })
    })
  })
  .then(() => {
    const app = createApp()
    // Démarrage du scheduler d'auto-lock comptable (run immédiat + toutes les 6h).
    // Désactivable par ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS=0.
    startAutoLockScheduler()
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
    })
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
