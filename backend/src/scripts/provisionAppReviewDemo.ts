import crypto from 'node:crypto'
import { readFile, writeFile, chmod } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import QuoteTemplate from '../models/QuoteTemplate.js'
import QuoteCounter from '../models/QuoteCounter.js'
import Interaction from '../models/Interaction.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ProjectUpdate from '../models/ProjectUpdate.js'
import SalesTarget from '../models/SalesTarget.js'

export const DEMO_MARKER = 'app-review-demo-v1'
export const CREDENTIALS_PATH = fileURLToPath(new URL('../../.app-review-credentials.local.json', import.meta.url))

export function assertDemoDatabase(uri: string | undefined, nodeEnv = process.env.NODE_ENV): URL {
  if (nodeEnv?.toLowerCase() === 'production') throw new Error('NODE_ENV=production interdit')
  if (!uri) throw new Error('--uri ou APP_REVIEW_MONGODB_URI requis (aucun repli sur MONGODB_URI)')
  let decoded: string
  let parsed: URL
  try {
    decoded = decodeURIComponent(uri)
    parsed = new URL(uri)
  } catch {
    throw new Error('URI Mongo invalide')
  }
  if (/prod/i.test(decoded)) throw new Error('URI ou base contenant prod interdite')
  // Pas de SRV/Atlas ; les URI multi-hôtes sont refusées pour garder la garde explicite.
  if (parsed.protocol !== 'mongodb:' || parsed.hostname.includes(',') || /mongodb\.net$/i.test(parsed.hostname)) {
    throw new Error('URI mongodb simple requise, Atlas interdit')
  }
  const database = decodeURIComponent(parsed.pathname.slice(1))
  if (!database || !/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Nom de base explicite requis')
  if (parsed.searchParams.has('dbName')) throw new Error('dbName doit figurer dans le chemin de l’URI')
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname)
  if (!local && !/demo|staging|test/i.test(database))
    throw new Error('Base de démo, staging, test ou hôte local requis')
  return parsed
}

function id(key: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(
    crypto.createHash('sha256').update(`${DEMO_MARKER}:${key}`).digest('hex').slice(0, 24),
  )
}

const team = [
  { key: 'lea', name: 'Léa Martin', role: 'COMMERCIAL' },
  { key: 'admin', name: 'Raphaël B.', role: 'ADMIN' },
  { key: 'hugo', name: 'Hugo Bernard', role: 'COMMERCIAL' },
]
const clients = [
  'Maison Calder',
  'Clinique Saint-Aubin',
  'Agence Pilote',
  'Boulangerie Rivière',
  'Cabinet Morel',
  'Lumen Formation',
  'Garage Mercier',
]
const accounts = [...team, ...clients.map((name, index) => ({ key: `client-${index}`, name, role: 'CLIENT' }))]
const leads = [
  {
    company: 'Maison Calder',
    contactName: 'Claire Calder',
    serviceType: 'Site vitrine + SEO',
    status: 'PROPOSAL',
    budget: 14800,
    leadTemperature: 'TRES_CHAUD',
    score: 86,
    owner: 'lea',
    action: '2026-10-23T10:30:00+02:00',
  },
  {
    company: 'Atelier Nova',
    contactName: 'Malik Benali',
    serviceType: 'E-commerce',
    status: 'DEMO',
    budget: 22500,
    leadTemperature: 'CHAUD',
    score: 74,
    owner: 'lea',
    action: '2026-10-23T14:00:00+02:00',
  },
  {
    company: 'Cabinet Ferrand Avocats',
    contactName: 'Sophie Ferrand',
    serviceType: 'Site + espace client',
    status: 'CONTACTED',
    budget: 9600,
    leadTemperature: 'TIEDE',
    score: 58,
    owner: 'lea',
    action: '2026-10-21T10:00:00+02:00',
  },
  {
    company: 'Brasserie Les Halles',
    contactName: 'Julien Roux',
    serviceType: 'Site + réservation',
    status: 'QUALIFIED',
    budget: 6400,
    leadTemperature: 'CHAUD',
    score: 69,
    owner: 'lea',
    action: null,
  },
  {
    company: 'Studio Okami',
    contactName: 'Yuki Tanaka',
    serviceType: 'App mobile',
    status: 'LEAD',
    budget: 38000,
    leadTemperature: 'TIEDE',
    score: 41,
    owner: null,
    action: null,
  },
  {
    company: 'Clinique Saint-Aubin',
    contactName: 'Dr Paul Aubin',
    serviceType: 'Plateforme de RDV',
    status: 'PROPOSAL',
    budget: 31000,
    leadTemperature: 'CHAUD',
    score: 80,
    owner: 'hugo',
    action: '2026-10-26T10:00:00+01:00',
  },
  {
    company: 'Domaine Verlaine',
    contactName: 'Anne Verlaine',
    serviceType: 'E-commerce vins',
    status: 'CONTACTED',
    budget: 12000,
    leadTemperature: 'FROID',
    score: 35,
    owner: 'hugo',
    action: '2026-10-27T10:00:00+01:00',
  },
  {
    company: 'Fondation Arcadie',
    contactName: 'Marc Delorme',
    serviceType: 'Refonte de site',
    status: 'DEMO',
    budget: 18200,
    leadTemperature: 'TIEDE',
    score: 62,
    owner: 'lea',
    action: '2026-10-23T16:00:00+02:00',
  },
]
const projects = [
  {
    ref: 'P-2026-018',
    client: 2,
    name: 'Plateforme de réservation',
    phase: 2,
    end: '2026-11-28',
    budget: 18400,
    invoiced: 9200,
    update: 'Maquettes validées, début du développement',
    date: '2026-10-20',
  },
  {
    ref: 'P-2026-015',
    client: 3,
    name: 'Site + click & collect',
    phase: 3,
    end: '2026-11-06',
    budget: 8900,
    invoiced: 4450,
    update: 'Version de recette en ligne',
    date: '2026-10-21',
  },
  {
    ref: 'P-2026-011',
    client: 4,
    name: 'Espace client',
    phase: 1,
    end: '2026-12-15',
    budget: 24000,
    invoiced: 7200,
    update: 'Arborescence validée',
    date: '2026-10-16',
  },
  {
    ref: 'P-2026-009',
    client: 5,
    name: 'Plateforme e-learning',
    phase: 4,
    end: '2026-10-30',
    budget: 32000,
    invoiced: 25600,
    update: 'Migration des contenus terminée',
    date: '2026-10-22',
  },
]
const quotes = [
  {
    ref: 'DV-2026-041',
    client: 0,
    lead: 0,
    project: null,
    amount: 14800,
    status: 'SENT',
    title: 'Site vitrine',
    owner: 'lea',
    signed: null,
  },
  {
    ref: 'DV-2026-039',
    client: 1,
    lead: 5,
    project: null,
    amount: 31000,
    status: 'SENT',
    title: 'Plateforme sur mesure',
    owner: 'hugo',
    signed: null,
  },
  {
    ref: 'DV-2026-038',
    client: 2,
    lead: null,
    project: 0,
    amount: 18400,
    status: 'SIGNED',
    title: 'Plateforme sur mesure',
    owner: 'lea',
    signed: '2026-10-09',
  },
  {
    ref: 'DV-2026-036',
    client: 3,
    lead: null,
    project: 1,
    amount: 8900,
    status: 'SIGNED',
    title: 'E-commerce',
    owner: 'lea',
    signed: '2026-10-02',
  },
  {
    ref: 'DV-2026-033',
    client: 6,
    lead: null,
    project: null,
    amount: 5200,
    status: 'EXPIRED',
    title: 'Site vitrine',
    owner: 'lea',
    signed: null,
  },
]

interface Credentials {
  database: string
  accounts: Record<string, { email: string; password: string }>
}

// Les données de démo sont écrites pour le vendredi 23 octobre 2026 ; on les décale d'un nombre
// entier de jours pour que « Aujourd'hui » reste rempli le jour où l'on provisionne.
function dayShift(now: Date): (value: string) => Date {
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2026, 9, 23)) / 86_400_000,
  )
  return (value) => new Date(Date.parse(value) + days * 86_400_000)
}

export async function provisionAppReviewDemo(options: {
  uri?: string
  dryRun?: boolean
  rotate?: boolean
  credentialsPath?: string
  now?: Date
}): Promise<void> {
  const parsed = assertDemoDatabase(options.uri)
  const credentialsPath = options.credentialsPath ?? CREDENTIALS_PATH
  const at = dayShift(options.now ?? new Date())
  if (String(process.env.MFA_ENABLED).toLowerCase() === 'true') {
    throw new Error('La démo sans second facteur exige MFA_ENABLED=false sur son instance isolée')
  }
  if (options.dryRun) {
    console.log(
      'Dry-run : 3 équipiers, 7 clients fictifs, 8 leads, 5 devis, 5 projets, 4 modèles, RDV. Aucune connexion ni écriture.',
    )
    return
  }
  const database = `${parsed.host}${parsed.pathname}`
  let credentials: Credentials = { database, accounts: {} }
  try {
    credentials = JSON.parse(await readFile(credentialsPath, 'utf8')) as Credentials
    if (credentials.database !== database) throw new Error('Le fichier d’identifiants appartient à une autre base')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await mongoose.connect(options.uri!)
  try {
    // Les identités stables et le marqueur empêchent de modifier un compte hors de cette démo.
    for (const account of accounts) {
      const email = `${account.key}@app-review.venio.test`
      const existing = await User.findOne({ $or: [{ _id: id(account.key) }, { email }] }).lean()
      if (existing && (!existing.tags.includes(DEMO_MARKER) || String(existing._id) !== String(id(account.key)))) {
        throw new Error('Un compte non géré par cette démo occupe une identité réservée')
      }
      if (existing && !credentials.accounts[account.key] && !options.rotate) {
        throw new Error('Identifiants locaux absents ; utiliser --rotate pour réinitialiser explicitement')
      }
    }
    for (const account of accounts) {
      if (!credentials.accounts[account.key] || options.rotate) {
        credentials.accounts[account.key] = {
          email: `${account.key}@app-review.venio.test`,
          password: `Vn9!${crypto.randomBytes(24).toString('base64url')}`,
        }
      }
    }
    // Sauver avant les hashes permet de rejouer après une interruption partielle.
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2) + '\n', { mode: 0o600 })
    await chmod(credentialsPath, 0o600)
    for (const account of accounts) {
      const secret = credentials.accounts[account.key]!
      const existing = await User.findById(id(account.key)).lean()
      const matches = existing && (await bcrypt.compare(secret.password, existing.passwordHash))
      const passwordHash = matches ? existing.passwordHash : await bcrypt.hash(secret.password, 12)
      await User.updateOne(
        { _id: id(account.key) },
        {
          $set: {
            name: account.name,
            email: secret.email,
            role: account.role,
            passwordHash,
            tags: [DEMO_MARKER],
            isActive: true,
            status: 'ACTIF',
            ownerAdminId: account.role === 'CLIENT' ? id('lea') : null,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorRecoveryCodeHashes: [],
            mfaGraceUntil: null,
            grantedPermissions: account.key === 'lea' ? ['upload_project_documents'] : [],
            deniedPermissions: [],
          },
          ...(options.rotate ? { $inc: { sessionVersion: 1 } } : {}),
        },
        { upsert: true, runValidators: true },
      )
    }
    for (const [index, lead] of leads.entries()) {
      const { owner, action, ...fields } = lead
      await Lead.updateOne(
        { _id: id(`lead-${index}`) },
        {
          $set: {
            ...fields,
            notes: DEMO_MARKER,
            source: index === 0 ? 'Carte de visite — Vivatech Paris' : 'Démo Apple',
            contactEmail: `contact-${index}@app-review.venio.test`,
            contactPhone: `+1 202-555-01${String(index).padStart(2, '0')}`,
            assignedTo: owner ? id(owner) : null,
            createdBy: id('admin'),
            nextActionAt: action ? at(action) : null,
            clientAccountId: index === 0 ? id('client-0') : null,
            createdAt: at(index === 4 ? '2026-10-23T08:52:00+02:00' : '2026-10-13T17:48:00+02:00'),
          },
        },
        { upsert: true, runValidators: true, overwriteImmutable: true },
      )
    }
    const phases = ['Cadrage', 'Conception', 'Développement', 'Recette', 'Mise en ligne']
    for (const [index, project] of projects.entries()) {
      const projectId = id(`project-${index}`)
      await Project.updateOne(
        { _id: projectId },
        {
          $set: {
            name: project.name,
            projectNumber: project.ref,
            client: id(`client-${project.client}`),
            assignedTo: id('lea'),
            responsible: 'Léa Martin',
            tags: [DEMO_MARKER],
            internalNotes: DEMO_MARKER,
            budget: { amount: project.budget, currency: 'EUR' },
            endDate: at(project.end),
            status: 'EN_COURS',
            billing: { amountInvoiced: project.invoiced, billingStatus: 'PARTIEL' },
          },
        },
        { upsert: true, runValidators: true },
      )
      for (const [order, title] of phases.entries()) {
        let status = 'A_VENIR'
        if (order < project.phase) status = 'TERMINEE'
        if (order === project.phase) status = 'EN_COURS'
        await ProjectPhase.updateOne(
          { _id: id(`phase-${index}-${order}`) },
          {
            $set: {
              project: projectId,
              title,
              order,
              status,
              description: DEMO_MARKER,
              createdBy: id('admin'),
            },
          },
          { upsert: true, runValidators: true },
        )
      }
      await ProjectUpdate.updateOne(
        { _id: id(`update-${index}`) },
        {
          $set: {
            project: projectId,
            title: project.update,
            description: DEMO_MARKER,
            createdBy: id('admin'),
            createdAt: at(project.date),
          },
        },
        { upsert: true, runValidators: true, timestamps: false },
      )
    }
    // Les devis sur lead restent rattachables depuis l'app ; un projet dédié porte le devis expiré.
    await Project.updateOne(
      { _id: id('project-garage') },
      {
        $set: {
          name: 'Site Garage Mercier',
          client: id('client-6'),
          assignedTo: id('lea'),
          projectNumber: 'APP-REVIEW-GARAGE',
          tags: [DEMO_MARKER],
          status: 'EN_ATTENTE',
        },
      },
      { upsert: true, runValidators: true },
    )
    for (const [index, quote] of quotes.entries()) {
      const document =
        (await QuoteProposal.findById(id(`quote-${index}`))) ??
        new QuoteProposal({ _id: id(`quote-${index}`), createdAt: at('2026-10-01') })
      let projectId = quote.project === null ? null : id(`project-${quote.project}`)
      if (index === 4) projectId = id('project-garage')
      document.set({
        reference: quote.ref,
        title: quote.title,
        intro: DEMO_MARKER,
        status: quote.status,
        client: id(`client-${quote.client}`),
        createdBy: id(quote.owner),
        project: projectId,
        leadId: quote.lead === null ? null : id(`lead-${quote.lead}`),
        lines: [
          {
            _id: id(`quote-line-${index}`),
            description: quote.title,
            quantity: 1,
            unitPrice: quote.amount,
            taxRate: 0,
          },
        ],
        firstViewedAt: index === 0 ? at('2026-10-22T18:12:00+02:00') : null,
        expiresAt: at(index === 4 ? '2026-10-01' : '2026-12-01'),
        signature: { signedAt: quote.signed ? at(quote.signed) : null },
      })
      await document.save()
    }
    await QuoteCounter.updateOne({ _id: 'quote:2026' }, { $max: { seq: 41 } }, { upsert: true })
    for (const [index, name] of ['Site vitrine', 'E-commerce', 'Plateforme sur mesure', 'Pack SEO'].entries()) {
      await QuoteTemplate.updateOne(
        { _id: id(`template-${index}`) },
        {
          $set: {
            name,
            title: name,
            intro: DEMO_MARKER,
            createdBy: id('admin'),
            isActive: true,
            lines: [
              {
                _id: id(`template-line-${index}`),
                description: name,
                quantity: 1,
                unitPrice: [5200, 8900, 18400, 1200][index],
                taxRate: 0,
              },
            ],
          },
        },
        { upsert: true, runValidators: true },
      )
    }
    const events = [
      {
        key: 'nova-meeting',
        lead: 1,
        kind: 'MEETING',
        subject: 'Démo Atelier Nova — visio',
        body: 'Présentation e-commerce en visio.',
        date: '2026-10-23T14:00:00+02:00',
        end: '2026-10-23T15:00:00+02:00',
      },
      {
        key: 'calder-discovery',
        lead: 0,
        kind: 'MEETING',
        subject: 'Découverte Maison Calder',
        body: 'Transcription fictive : refonte du site vitrine et référencement. Aucun enregistrement réel.',
        date: '2026-10-17T15:30:00+02:00',
        end: null,
      },
      {
        key: 'calder-sent',
        lead: 0,
        kind: 'NOTE',
        subject: 'Devis DV-2026-041 envoyé',
        body: 'Proposition de 14 800 € envoyée par Léa.',
        date: '2026-10-20T11:05:00+02:00',
        end: null,
      },
      {
        key: 'calder-viewed',
        lead: 0,
        kind: 'NOTE',
        subject: 'Devis DV-2026-041 ouvert',
        body: 'La cliente a ouvert le devis.',
        date: '2026-10-22T18:12:00+02:00',
        end: null,
      },
    ]
    for (const event of events) {
      await Interaction.updateOne(
        { _id: id(event.key) },
        {
          $set: {
            subjectType: 'LEAD',
            subjectId: id(`lead-${event.lead}`),
            author: id('lea'),
            kind: event.kind,
            subject: event.subject,
            body: `[${DEMO_MARKER}] ${event.body}`,
            occurredAt: at(event.date),
            endsAt: event.end ? at(event.end) : null,
          },
        },
        { upsert: true, runValidators: true },
      )
    }
    const month = at('2026-10-23T12:00:00+02:00').toISOString().slice(0, 7)
    await SalesTarget.updateOne(
      { user: id('lea'), month },
      { $set: { amount: 40000, updatedBy: id('admin') } },
      { upsert: true, runValidators: true },
    )
    console.log(
      'Démo Apple prête. Identifiants enregistrés uniquement dans backend/.app-review-credentials.local.json (0600).',
    )
  } finally {
    await mongoose.disconnect()
  }
}

async function main(): Promise<void> {
  let uri = process.env.APP_REVIEW_MONGODB_URI
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg.startsWith('--uri=')) uri = arg.slice(6)
    else if (arg === '--uri') uri = args[++index]
    else if (!['--rotate', '--dry-run'].includes(arg)) throw new Error('Option inconnue')
  }
  await provisionAppReviewDemo({ uri, rotate: args.includes('--rotate'), dryRun: args.includes('--dry-run') })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Les erreurs Mongo peuvent contenir l'URI et ses secrets ; ne jamais les journaliser.
    console.error(
      'Provisionnement refusé ou échoué : vérifier les gardes, la base dédiée et le fichier local. Aucun secret affiché.',
    )
    process.exitCode = 1
  })
}
