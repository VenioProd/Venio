import crypto from 'crypto'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { sendAdminCredentials } from '../lib/email.js'

dotenv.config()

const MONGO_URI = process.env.MONGODB_URI
const TARGET_EMAIL = 'bentv@me.com'

const CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generatePassword(length: number = 14): string {
  const bytes = crypto.randomBytes(length)
  let s = ''
  for (let i = 0; i < length; i++) s += CHARSET[bytes[i] % CHARSET.length]
  return s
}

if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

async function reset(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const user = await User.findOne({ email: TARGET_EMAIL })
  if (!user) {
    console.error('Utilisateur non trouvé:', TARGET_EMAIL)
    await mongoose.disconnect()
    process.exit(1)
  }

  const newPassword = generatePassword(14)
  const passwordHash = await bcrypt.hash(newPassword, 10)
  await User.updateOne({ email: TARGET_EMAIL }, { $set: { passwordHash } })

  const emailResult = await sendAdminCredentials({
    to: TARGET_EMAIL,
    name: (user as { name?: string }).name || 'Raphael',
    email: TARGET_EMAIL,
    password: newPassword,
  })

  console.log('Mot de passe réinitialisé pour', TARGET_EMAIL)
  console.log('')
  if (emailResult.sent) {
    console.log('Un email avec les nouveaux identifiants a été envoyé à cette adresse.')
  } else {
    console.log('Envoi email échoué:', emailResult.error || '')
    console.log('Nouveau mot de passe (à copier):', newPassword)
  }
  console.log('')
  console.log('Connexion: /admin/login')
  console.log('')

  await mongoose.disconnect()
}

reset().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
