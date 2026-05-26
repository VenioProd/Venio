/**
 * Migration : séparation rôle/jobTitle + granted/deniedPermissions
 *
 * 1. Users role=PDG → role=SUPER_ADMIN + jobTitle=PDG
 * 2. Users avec customPermissions non-null → grantedPermissions, deniedPermissions=[], supprime customPermissions
 *
 * Usage :
 *   npx ts-node scripts/migrate-roles.ts
 */

import mongoose from 'mongoose'

const MONGO_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://venio:K9%21rT%407qL%23e2F%24XwM8@veniocluster.suwlznc.mongodb.net/venio'

async function run() {
  console.log('Connecting to MongoDB…')
  await mongoose.connect(MONGO_URI)
  console.log('Connected.')

  const db = mongoose.connection.db!
  const users = db.collection('users')

  // ── 1. PDG → SUPER_ADMIN + jobTitle=PDG ──────────────────────────────────
  const pdgResult = await users.updateMany(
    { role: 'PDG' },
    {
      $set: { role: 'SUPER_ADMIN', jobTitle: 'PDG' },
      $unset: {},
    }
  )
  console.log(`PDG → SUPER_ADMIN: ${pdgResult.modifiedCount} user(s) migrated`)

  // ── 2. customPermissions → grantedPermissions ─────────────────────────────
  const withCustom = await users
    .find({
      customPermissions: { $exists: true, $ne: null, $not: { $size: 0 } },
    })
    .toArray()

  console.log(`Found ${withCustom.length} user(s) with customPermissions to migrate`)

  let migratedPerms = 0
  for (const user of withCustom) {
    const custom: string[] = Array.isArray(user.customPermissions) ? user.customPermissions : []
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          grantedPermissions: custom,
          deniedPermissions: [],
        },
        $unset: { customPermissions: '' },
      }
    )
    migratedPerms++
  }
  console.log(`customPermissions → grantedPermissions: ${migratedPerms} user(s) migrated`)

  // ── 3. Set defaults on remaining users missing the new fields ─────────────
  const defaultsResult = await users.updateMany(
    {
      grantedPermissions: { $exists: false },
    },
    {
      $set: { grantedPermissions: [], deniedPermissions: [] },
      $unset: { customPermissions: '' },
    }
  )
  console.log(`Default fields set on ${defaultsResult.modifiedCount} additional user(s)`)

  await mongoose.disconnect()
  console.log('Done.')
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
