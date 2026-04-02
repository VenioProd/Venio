import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../models/User.js'

dotenv.config()

const OLD_EMAIL = 'raphael@bentv.me'
const NEW_EMAIL = 'bentv@me.com'

const MONGO_URI = process.env.MONGODB_URI
if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

async function fix(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const result = await User.updateOne(
    { email: OLD_EMAIL },
    { $set: { email: NEW_EMAIL } }
  )

  if (result.matchedCount === 0) {
    console.log('Aucun utilisateur trouvé avec:', OLD_EMAIL)
    console.log('Vérification par nom...')
    const byName = await User.findOne({ name: /raphael/i }, { email: 1, name: 1 })
    if (byName) {
      console.log('Trouvé:', byName.name, '—', byName.email)
    } else {
      console.log('Aucun utilisateur Raphaël trouvé.')
    }
  } else {
    console.log(`Email mis à jour : ${OLD_EMAIL} → ${NEW_EMAIL}`)
  }

  await mongoose.disconnect()
}

fix().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
