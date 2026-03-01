import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Project from '../models/Project.js'

dotenv.config()

const MONGO_URI = process.env.MONGODB_URI

if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

const DEMO_PASSWORD = 'demo2025'

const nowPlusDays = (days: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

const nowMinusDays = (days: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

interface ClientDef {
  name: string
  email: string
}

const clients: ClientDef[] = [
  {
    name: 'Cabinet Mercier & Associés',
    email: `contact@mercier-associes.venio-fictif.local`,
  },
  {
    name: 'Studio Prism',
    email: `team@studioprism.venio-fictif.local`,
  },
  {
    name: 'FlowMetrics SAS',
    email: `hello@flowmetrics.venio-fictif.local`,
  },
]

interface ProjectTwoTemplate {
  name: string
  summary: string
  description: string
  status: string
  serviceTypes: string[]
  deliverableTypes: string[]
  tags: string[]
  budgetAmount: number
  internalNotes: string
  deliveredAt?: Date
  billingStatus?: string
  amountInvoiced?: number
}

const projectOneTemplate = (clientId: mongoose.Types.ObjectId, baseNum: number) => ({
  client: clientId,
  name: 'Refonte site vitrine et identité digitale',
  summary: 'Modernisation complète du site web et alignement avec la nouvelle stratégie de marque. Objectif : améliorer la crédibilité et le taux de conversion.',
  description: `Refonte complète incluant : audit de l'existant, nouvelle charte graphique, maquettes UX/UI desktop et mobile, développement sur mesure (pas de CMS générique), intégration formulaire de contact et prise de rendez-vous, optimisation SEO technique et contenu. Livrables : maquettes validées, code source documenté, guide de style, formation à la mise à jour des contenus.`,
  status: 'EN_COURS',
  priority: 'HAUTE',
  serviceTypes: ['Design', 'Développement', 'UX/UI', 'SEO'],
  deliverableTypes: ['Maquettes', 'Code source', 'Documentation technique', 'Guide de style'],
  tags: ['refonte', 'site vitrine', 'identité', 'responsive', 'SEO'],
  budget: { amount: 18500, currency: 'EUR', note: 'Budget validé en 2 facturations : 40% à la validation maquettes, 60% à la mise en production.' },
  billing: { amountInvoiced: 7400, billingStatus: 'PARTIEL', quoteReference: `DEV-2025-${baseNum + 1}` },
  startDate: nowMinusDays(12),
  endDate: nowPlusDays(38),
  reminderAt: nowPlusDays(5),
  responsible: 'Sophie Martin — Chef de projet',
  internalNotes: 'Client exigeant sur le rendu visuel. Privilégier les échanges courts et les validations par étape.',
  isArchived: false,
  projectNumber: `VENIO-2025-${String(baseNum + 1).padStart(3, '0')}`,
  deadlines: [
    { label: 'Kickoff', dueAt: nowMinusDays(12) },
    { label: 'Validation maquettes homepage', dueAt: nowPlusDays(3) },
    { label: 'Validation maquettes pages internes', dueAt: nowPlusDays(10) },
    { label: 'Développement phase 1', dueAt: nowPlusDays(22) },
    { label: 'Tests et recette', dueAt: nowPlusDays(32) },
    { label: 'Mise en production', dueAt: nowPlusDays(38) },
  ],
})

const projectTwoTemplates: ProjectTwoTemplate[] = [
  {
    name: 'Stratégie éditoriale et contenu Q2–Q3',
    summary: 'Définition d\'une ligne éditoriale et d\'un calendrier de contenu pour renforcer le positionnement et générer des leads qualifiés.',
    description: `Mission de conseil et production : audit de l'existant éditorial et des canaux, définition de la ligne éditoriale et du ton de marque, création d'un calendrier de contenu sur 6 mois, rédaction des premiers contenus (pages site, articles de blog, posts réseaux). Livrables : document de stratégie éditoriale, calendrier détaillé, 12 contenus rédigés, recommandations pour la suite.`,
    status: 'EN_ATTENTE',
    serviceTypes: ['Conseil', 'Communication', 'Stratégie'],
    deliverableTypes: ['Rapport', 'Contenu', 'Calendrier éditorial'],
    tags: ['stratégie', 'éditorial', 'contenu', 'conseil'],
    budgetAmount: 8200,
    internalNotes: 'Démarrage prévu après livraison du site. Brief client à planifier.',
  },
  {
    name: 'Campagne acquisition et landing pages',
    summary: 'Lancement d\'une campagne d\'acquisition avec création de landing pages dédiées et suivi des performances.',
    description: `Stratégie d'acquisition : définition des personas et messages, création de 3 landing pages optimisées conversion, mise en place du tracking (Google Analytics, événements), campagnes Google Ads et Meta Ads sur 3 mois. Livrables : brief créatif, maquettes landing pages, code des pages, rapport de suivi mensuel et recommandations d'optimisation.`,
    status: 'EN_ATTENTE',
    serviceTypes: ['Marketing', 'Développement', 'Conseil'],
    deliverableTypes: ['Landing pages', 'Rapport', 'Maquettes', 'Code source'],
    tags: ['acquisition', 'ads', 'landing', 'conversion'],
    budgetAmount: 11500,
    internalNotes: 'Budget ads hors forfait. Prévoir point hebdo les 2 premières semaines.',
  },
  {
    name: 'Identité de marque et charte graphique',
    summary: 'Création d\'une identité visuelle cohérente et d\'une charte graphique applicable à tous les supports.',
    description: `Prestation branding complète : atelier de positionnement, création du logo et déclinaisons, définition de la charte (couleurs, typographies, principes graphiques), création des templates principaux (en-tête email, présentation, réseaux sociaux). Livrables : guide de la marque (PDF), pack d'assets (logo vectoriel, PNG, favicon), templates éditables.`,
    status: 'TERMINE',
    serviceTypes: ['Design', 'Stratégie', 'Communication'],
    deliverableTypes: ['Assets', 'Rapport', 'Guide de marque', 'Templates'],
    tags: ['branding', 'identité', 'logo', 'charte graphique'],
    budgetAmount: 7500,
    internalNotes: 'Projet livré et facturé. Client satisfait, possibilité de suite sur supports print.',
    deliveredAt: nowMinusDays(8),
    billingStatus: 'FACTURE',
    amountInvoiced: 7500,
  },
]

const buildProjectsForClient = (clientId: mongoose.Types.ObjectId, clientIndex: number) => {
  const baseNum = (clientIndex + 1) * 100
  const proj1 = projectOneTemplate(clientId, baseNum)
  const t2 = projectTwoTemplates[clientIndex]
  const proj2 = {
    client: clientId,
    name: t2.name,
    summary: t2.summary,
    description: t2.description,
    status: t2.status,
    priority: 'NORMALE' as const,
    serviceTypes: t2.serviceTypes,
    deliverableTypes: t2.deliverableTypes,
    tags: t2.tags,
    budget: { amount: t2.budgetAmount, currency: 'EUR', note: t2.budgetAmount >= 10000 ? 'Facturation en 2 fois : 50% à la commande, 50% à la livraison.' : 'Forfait TTC.' },
    billing: {
      amountInvoiced: t2.amountInvoiced ?? null,
      billingStatus: t2.billingStatus ?? 'NON_FACTURE',
      quoteReference: `CON-2025-${baseNum + 2}`,
    },
    startDate: t2.deliveredAt ? nowMinusDays(45) : nowPlusDays(14),
    endDate: t2.deliveredAt ? nowMinusDays(8) : nowPlusDays(95),
    deliveredAt: t2.deliveredAt ?? null,
    reminderAt: t2.deliveredAt ? null : nowPlusDays(10),
    responsible: t2.deliveredAt ? 'Claire Rousseau — Directrice artistique' : 'Thomas Dubois — Responsable Stratégie',
    internalNotes: t2.internalNotes,
    isArchived: false,
    projectNumber: `VENIO-2025-${String(baseNum + 2).padStart(3, '0')}`,
    deadlines: t2.deliveredAt
      ? [
          { label: 'Atelier positionnement', dueAt: nowMinusDays(42) },
          { label: 'Propositions de logo', dueAt: nowMinusDays(28) },
          { label: 'Validation logo', dueAt: nowMinusDays(21) },
          { label: 'Charte graphique', dueAt: nowMinusDays(14) },
          { label: 'Livraison finale', dueAt: nowMinusDays(8) },
        ]
      : [
          { label: 'Brief et cadrage', dueAt: nowPlusDays(14) },
          { label: 'Livrable stratégie / maquettes', dueAt: nowPlusDays(35) },
          { label: 'Validation client', dueAt: nowPlusDays(42) },
          { label: 'Livraison batch 1', dueAt: nowPlusDays(60) },
          { label: 'Livraison finale', dueAt: nowPlusDays(95) },
        ],
  }
  return [proj1, proj2]
}

async function seed(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const existingEmails = clients.map((c) => c.email)
  const existingUsers = await User.find({ email: { $in: existingEmails } })
  if (existingUsers.length) {
    const ids = existingUsers.map((u) => u._id)
    await Project.deleteMany({ client: { $in: ids } })
    await User.deleteMany({ _id: { $in: ids } })
    console.log(`Suppression de ${existingUsers.length} ancien(s) client(s) fictif(s) et leurs projets.`)
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const createdClients = await User.insertMany(
    clients.map((c) => ({
      name: c.name,
      email: c.email,
      passwordHash,
      role: 'CLIENT',
    }))
  )

  const allProjects: Record<string, unknown>[] = []
  createdClients.forEach((user, index) => {
    const projectsForClient = buildProjectsForClient(user._id as mongoose.Types.ObjectId, index)
    allProjects.push(...projectsForClient)
  })

  await Project.insertMany(allProjects)

  console.log('Seed terminé avec succès.')
  console.log(`  → ${createdClients.length} clients créés`)
  console.log(`  → ${allProjects.length} projets créés (2 par client)`)
  console.log('')
  console.log('Identifiants de connexion (espace client) :')
  createdClients.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name}`)
    console.log(`     Email: ${c.email}`)
    console.log(`     Mot de passe: ${DEMO_PASSWORD}`)
  })
  console.log('')

  await mongoose.disconnect()
}

seed().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
