import mongoose from 'mongoose'
import dotenv from 'dotenv'
import QuoteProposal, { allocateQuoteReference } from '../models/QuoteProposal.js'

dotenv.config()
const DRY_RUN = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI manquant')
  await mongoose.connect(uri)
  try {
    const missing = { $or: [{ reference: { $exists: false } }, { reference: null }, { reference: '' }] }
    console.log(`Mode : ${DRY_RUN ? 'DRY RUN (aucune écriture)' : 'EXÉCUTION'}`)
    console.log(`Devis sans référence : ${await QuoteProposal.countDocuments(missing)}`)
    if (DRY_RUN) return
    let modified = 0
    for await (const quote of QuoteProposal.find(missing)
      .sort({ createdAt: 1, _id: 1 })
      .select('createdAt')
      .lean()
      .cursor()) {
      const reference = await allocateQuoteReference(quote.createdAt)
      const result = await QuoteProposal.updateOne({ _id: quote._id, ...missing }, { $set: { reference } })
      modified += result.modifiedCount
    }
    console.log(`Devis repris : ${modified}`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('Erreur fatale :', err)
  process.exitCode = 1
})
