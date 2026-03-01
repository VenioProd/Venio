/**
 * Seed script: create fictional projects for all existing clients in the database.
 * Run from backend: node src/scripts/seedClientProjects.js
 *
 * Uses clients already in the DB (role CLIENT) and assigns each 1–3 projects
 * with varied statuses and realistic data.
 */

import dotenv from 'dotenv'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Project from '../models/Project.js'

dotenv.config()

const MONGO_URI = process.env.MONGODB_URI

if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

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

interface ProjectTemplate {
  name: string
  summary: string
  description: string
  status: string
  priority: string
  serviceTypes: string[]
  deliverableTypes: string[]
  tags: string[]
  budget: { amount: number; currency: string; note: string }
  billing: { amountInvoiced: number | null; billingStatus: string; quoteReference: string }
  startDate: Date | null
  endDate: Date | null
  deliveredAt?: Date | null
}

// Project templates (client will be set per client)
const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    name: 'Refonte site vitrine',
    summary: 'Moderniser l\u2019image et améliorer la conversion.',
    description: 'Nouvelle charte et refonte UX/UI du site.',
    status: 'EN_COURS',
    priority: 'HAUTE',
    serviceTypes: ['Design', 'Développement'],
    deliverableTypes: ['Maquettes', 'Code source'],
    tags: ['refonte', 'web'],
    budget: { amount: 12000, currency: 'EUR', note: 'Budget validé' },
    billing: { amountInvoiced: 4000, billingStatus: 'PARTIEL', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Campagne acquisition',
    summary: 'Booster les leads via ads et landing pages.',
    description: 'Plan média + landing pages optimisées.',
    status: 'EN_ATTENTE',
    priority: 'NORMALE',
    serviceTypes: ['Conseil', 'Marketing'],
    deliverableTypes: ['Rapport', 'Contenu'],
    tags: ['acquisition', 'ads'],
    budget: { amount: 6500, currency: 'EUR', note: '' },
    billing: { amountInvoiced: null, billingStatus: 'NON_FACTURE', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Plateforme e-commerce',
    summary: 'Lancer la boutique en ligne.',
    description: 'MVP e-commerce + intégration paiement.',
    status: 'EN_COURS',
    priority: 'URGENTE',
    serviceTypes: ['Développement', 'Intégration'],
    deliverableTypes: ['Code source', 'Documentation'],
    tags: ['ecommerce', 'prioritaire'],
    budget: { amount: 25000, currency: 'EUR', note: 'En 2 phases' },
    billing: { amountInvoiced: 12500, billingStatus: 'PARTIEL', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Branding & identité',
    summary: 'Aligner le positionnement et la marque.',
    description: 'Logo, guidelines, kit réseaux.',
    status: 'TERMINE',
    priority: 'BASSE',
    serviceTypes: ['Design', 'Stratégie'],
    deliverableTypes: ['Assets', 'Rapport'],
    tags: ['branding'],
    budget: { amount: 4000, currency: 'EUR', note: '' },
    billing: { amountInvoiced: 4000, billingStatus: 'FACTURE', quoteReference: '' },
    startDate: null,
    endDate: null,
    deliveredAt: null,
  },
  {
    name: 'Stratégie digitale',
    summary: 'Audit et roadmap sur 12 mois.',
    description: 'Audit de présence en ligne et plan d\u2019action.',
    status: 'EN_COURS',
    priority: 'NORMALE',
    serviceTypes: ['Conseil', 'SEO'],
    deliverableTypes: ['Rapport', 'Présentation'],
    tags: ['stratégie', 'audit'],
    budget: { amount: 3500, currency: 'EUR', note: '' },
    billing: { amountInvoiced: 3500, billingStatus: 'FACTURE', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Application mobile',
    summary: 'App iOS/Android pour la marque.',
    description: 'Conception et développement d\u2019une application mobile native ou cross-platform.',
    status: 'EN_ATTENTE',
    priority: 'HAUTE',
    serviceTypes: ['Développement', 'Design', 'UX/UI'],
    deliverableTypes: ['Maquettes', 'Code source', 'Documentation'],
    tags: ['mobile', 'app'],
    budget: { amount: 18000, currency: 'EUR', note: '' },
    billing: { amountInvoiced: null, billingStatus: 'NON_FACTURE', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Communication & contenus',
    summary: 'Contenus éditoriaux et visuels pour les réseaux.',
    description: 'Création de contenus et calendrier éditorial.',
    status: 'EN_COURS',
    priority: 'NORMALE',
    serviceTypes: ['Communication', 'Design'],
    deliverableTypes: ['Contenus', 'Calendrier', 'Assets'],
    tags: ['communication', 'réseaux sociaux'],
    budget: { amount: 5000, currency: 'EUR', note: 'Mensuel' },
    billing: { amountInvoiced: 2500, billingStatus: 'PARTIEL', quoteReference: '' },
    startDate: null,
    endDate: null,
  },
  {
    name: 'Formation équipe',
    summary: 'Formation à l\u2019outil ou aux bonnes pratiques.',
    description: 'Sessions de formation sur mesure.',
    status: 'TERMINE',
    priority: 'BASSE',
    serviceTypes: ['Formation', 'Conseil'],
    deliverableTypes: ['Support de formation', 'Documentation'],
    tags: ['formation'],
    budget: { amount: 2200, currency: 'EUR', note: '' },
    billing: { amountInvoiced: 2200, billingStatus: 'FACTURE', quoteReference: '' },
    startDate: null,
    endDate: null,
    deliveredAt: null,
  },
]

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
}

function applyDates(project: ProjectTemplate, status: string): ProjectTemplate & { deliveredAt?: Date | null } {
  const base = { ...project }
  if (status === 'EN_COURS') {
    base.startDate = nowMinusDays(7 + Math.floor(Math.random() * 30))
    base.endDate = nowPlusDays(14 + Math.floor(Math.random() * 60))
  } else if (status === 'EN_ATTENTE') {
    base.startDate = nowPlusDays(5 + Math.floor(Math.random() * 20))
    base.endDate = nowPlusDays(45 + Math.floor(Math.random() * 90))
  } else if (status === 'TERMINE') {
    base.startDate = nowMinusDays(60 + Math.floor(Math.random() * 90))
    base.endDate = nowMinusDays(7 + Math.floor(Math.random() * 30))
    base.deliveredAt = base.endDate
  }
  return base
}

async function seed(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const clients = await User.find({ role: 'CLIENT' }).select('_id name companyName').lean()

  if (clients.length === 0) {
    console.log('Aucun client en base. Créez d\u2019abord des comptes clients.')
    await mongoose.disconnect()
    process.exit(0)
    return
  }

  let totalCreated = 0

  for (const client of clients) {
    // 1 to 3 projects per client
    const numProjects = 1 + Math.floor(Math.random() * 3)
    const templates = pickRandom(PROJECT_TEMPLATES, numProjects)

    const projectsToInsert = templates.map((tpl, index) => {
      const status = tpl.status
      const withDates = applyDates(tpl, status)
      const { startDate, endDate, deliveredAt, ...rest } = withDates
      return {
        ...rest,
        client: client._id,
        startDate: startDate || null,
        endDate: endDate || null,
        deliveredAt: deliveredAt || null,
        projectNumber: `VENIO-${new Date().getFullYear()}-${String(totalCreated + index + 1).padStart(3, '0')}`,
        internalNotes: 'Projet fictif (seed).',
      }
    })

    await Project.insertMany(projectsToInsert)
    totalCreated += projectsToInsert.length

    const label = (client as { companyName?: string; name?: string }).companyName || (client as { name?: string }).name
    console.log(`  ${label}: ${projectsToInsert.length} projet(s) — ${projectsToInsert.map((p) => p.name).join(', ')}`)
  }

  console.log(`\n${totalCreated} projet(s) créé(s) pour ${clients.length} client(s).`)
  await mongoose.disconnect()
}

seed().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
