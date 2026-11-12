import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { migrations } from '../lib/migrations.js'

export async function runMigrationCli(args: string[]): Promise<void> {
  if (args.length === 1 && args[0] === '--list') {
    console.log(Object.keys(migrations).join('\n'))
    return
  }
  const apply = args[0] === '--apply'
  const id = args[0] === '--dry-run' || apply ? args[1] : args[0]
  const expectedLength = args[0]?.startsWith('--') ? 2 : 1
  if (!id || !migrations[id] || args.length !== expectedLength) {
    throw new Error('Usage: migrate --list | [--dry-run | --apply] <id>')
  }
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required')
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  try {
    console.log(JSON.stringify({ id, dryRun: !apply, result: await migrations[id](!apply) }))
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrationCli(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
