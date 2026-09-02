/**
 * Provisionne un consultant externe : un compte administrateur privé de toute
 * visibilité financière, plus un jeton d'accès à l'API agent aligné sur ces
 * mêmes droits.
 *
 * Le script reproduit exactement ce que font POST /api/admin/admins et
 * POST /api/admin/agent-tokens, sans passer par HTTP — il sert à provisionner
 * un accès quand on n'a pas de session admin sous la main.
 *
 * Usage :
 *   npm --prefix backend run provision:consultant -- --email=... --name=... [--dry-run]
 *
 * Le secret du jeton n'est affiché qu'une fois, à la création. Il n'est jamais
 * récupérable ensuite : seul son bcrypt est stocké.
 */
import crypto from 'crypto'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import { generateAgentToken } from '../lib/agent/tokens.js'
import { findUnknownScopes } from '../lib/agent/scopes.js'
import { PERMISSIONS } from '../lib/permissions.js'
import { sendAdminCredentials } from '../lib/email.js'

dotenv.config()

/**
 * Tout ce qui touche à l'argent, retiré du rôle ADMIN : écritures comptables,
 * TVA, export FEC, et la facturation client (devis, factures, CA encaissé).
 */
const DENIED_PERMISSIONS: string[] = [
  PERMISSIONS.VIEW_ACCOUNTING,
  PERMISSIONS.MANAGE_ACCOUNTING,
  PERMISSIONS.LOCK_ACCOUNTING,
  PERMISSIONS.VIEW_VAT,
  PERMISSIONS.MANAGE_VAT,
  PERMISSIONS.EXPORT_FEC,
  PERMISSIONS.VIEW_BILLING,
  PERMISSIONS.MANAGE_BILLING,
]

/**
 * Miroir de ce que le compte peut faire dans l'interface. Volontairement
 * absents : read:accounting et read/write:billing (financier), read:analytics
 * (GET /analytics/billing renvoie le CA et les factures), read:toolaccess
 * (identifiants d'outils), read/write:users, ainsi que backup, 2fa, audit,
 * automations, arrow, qualiopi, interns, subsidiaries et gestion — hors du
 * périmètre d'un intervenant externe.
 */
const SCOPES: string[] = [
  'read:crm',
  'write:crm',
  'read:projects',
  'write:projects',
  'read:documents',
  'write:documents',
  'read:tasks',
  'write:tasks',
  'read:tickets',
  'write:tickets',
  'read:messages',
  'write:messages',
  'read:internal-messaging',
  'write:internal-messaging',
  'read:notifications',
  'write:notifications',
  'read:calendar',
  'write:calendar',
  'read:resources',
  'write:resources',
  'read:dev',
  'write:dev',
]

const PASSWORD_CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generatePassword(length = 20): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length]
  return out
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI
  const email = (arg('email') || '').toLowerCase().trim()
  const name = arg('name') || ''
  const jobTitle = arg('job-title') || 'Consultant externe — beta testeur'
  const dryRun = process.argv.includes('--dry-run')

  if (!mongoUri) throw new Error('MONGODB_URI est requis')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('--email=<adresse valide> est requis')
  if (!name) throw new Error('--name=<nom complet> est requis')

  const unknown = findUnknownScopes(SCOPES)
  if (unknown.length > 0) throw new Error(`Scope(s) inconnu(s) : ${unknown.join(', ')}`)

  await mongoose.connect(mongoUri)
  const dbName = mongoose.connection.name
  console.log(`\nBase : ${dbName}${dryRun ? '  [DRY RUN — aucune écriture]' : ''}`)

  const existing = await User.findOne({ email })
  if (existing) {
    throw new Error(`Un compte existe déjà pour ${email} (rôle ${existing.role}). Rien n'a été modifié.`)
  }

  console.log(`\nCompte à créer   : ${name} <${email}>`)
  console.log(`Rôle             : ADMIN`)
  console.log(`Permissions ôtées: ${DENIED_PERMISSIONS.join(', ')}`)
  console.log(`Token API        : ${SCOPES.length} scopes`)

  if (dryRun) {
    console.log('\nDry run terminé — rien écrit.')
    await mongoose.disconnect()
    return
  }

  const password = generatePassword()
  const user = await User.create({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    name,
    role: 'ADMIN',
    jobTitle,
    grantedPermissions: [],
    deniedPermissions: DENIED_PERMISSIONS,
    isActive: true,
  })

  // Le jeton agent vit sur son propre User technique : c'est la convention de
  // POST /api/admin/agent-tokens, un PAT n'étant jamais porté par un humain.
  const generated = await generateAgentToken()
  const agentEmail = `agent-${new mongoose.Types.ObjectId().toString()}@venio.internal`
  const agentUser = await User.create({
    email: agentEmail,
    passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
    name: `${name} (API)`,
    role: 'AGENT',
    isActive: true,
  })

  let token
  try {
    token = await AgentToken.create({
      name: `${name} — consultant externe`,
      prefix: generated.prefix,
      tokenHash: generated.hash,
      userId: agentUser._id,
      scopes: SCOPES,
      rateLimitPerMin: 120,
      expiresAt: null,
      notes: `Provisionné par provisionExternalConsultant.ts pour ${email}. Aucun scope financier.`,
      createdBy: user._id,
    })
  } catch (err) {
    await User.deleteOne({ _id: agentUser._id }).catch(() => {})
    await User.deleteOne({ _id: user._id }).catch(() => {})
    throw err
  }

  agentUser.agentTokenId = token._id as mongoose.Types.ObjectId
  await agentUser.save()

  // Le mot de passe part par email s'il est demandé ; le jeton d'API, jamais.
  // Un PAT circulant par mail resterait valable indéfiniment dans une boîte,
  // sans le réflexe de changement qu'impose un mot de passe temporaire.
  let mailStatus = 'non demandé'
  if (process.argv.includes('--send-email')) {
    try {
      await sendAdminCredentials({ to: email, name, email, password })
      mailStatus = `envoyé à ${email}`
    } catch (err) {
      mailStatus = `ÉCHEC (${(err as Error).message}) — transmets le mot de passe à la main`
    }
  }

  console.log('\n─────────────────────────────────────────────')
  console.log('  À transmettre par un canal sûr, une seule fois')
  console.log('─────────────────────────────────────────────')
  console.log(`  Identifiant       : ${email}`)
  console.log(`  Mot de passe      : ${password}`)
  console.log(`  Token API         : ${generated.plain}`)
  console.log('─────────────────────────────────────────────')
  console.log(`  Email identifiants : ${mailStatus}`)
  console.log('  Le mot de passe est temporaire : à changer à la première connexion.')
  console.log('  Le token ne sera plus jamais affiché.\n')

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(`\nÉchec : ${(err as Error).message}\n`)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
