/**
 * Backfill : crée un User AGENT pour chaque AgentToken existant sans userId.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage :
 *   npx tsx backend/scripts/backfill-agent-users.ts
 *
 * Sortie : journal en stdout, code de sortie 0 si OK.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import AgentToken from '../src/models/AgentToken.js'
import User from '../src/models/User.js'

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('MONGO_URI manquant.')
    process.exit(1)
  }
  await mongoose.connect(mongoUri)
  console.log('Connecté à Mongo.')

  const tokens = await AgentToken.find({ $or: [{ userId: null }, { userId: { $exists: false } }] })
  console.log(`Tokens à traiter : ${tokens.length}`)

  let created = 0
  let skipped = 0

  for (const token of tokens) {
    // Cas 1 : un User AGENT existe déjà pour ce token (run précédent partiel)
    const existing = await User.findOne({ agentTokenId: token._id })
    if (existing) {
      await AgentToken.updateOne({ _id: token._id }, { $set: { userId: existing._id } })
      console.log(`  ↺ ${token.name} : User déjà créé, lien remis (${existing._id}).`)
      skipped++
      continue
    }

    // Cas 2 : nouvelle création
    const email = `agent-${token._id.toString()}@venio.internal`
    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
      name: token.status === 'REVOKED' ? `[Révoqué] ${token.name}` : token.name,
      role: 'AGENT',
      isActive: token.status === 'ACTIVE',
      agentTokenId: token._id,
    })
    await AgentToken.updateOne({ _id: token._id }, { $set: { userId: user._id } })
    console.log(`  + ${token.name} → User ${user._id}`)
    created++
  }

  console.log(`\nTerminé. Créés : ${created}, déjà liés : ${skipped}.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Erreur backfill :', err)
  process.exit(1)
})
