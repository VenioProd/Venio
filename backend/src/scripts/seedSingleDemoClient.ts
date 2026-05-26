import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Project from '../models/Project.js'

dotenv.config()

// Garde-fou : interdit toute exécution sur l'environnement de production.
if (process.env.NODE_ENV === 'production') {
  console.error('Seed scripts forbidden in production')
  process.exit(1)
}

const MONGO_URI = process.env.MONGODB_URI

if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

const demoClient = {
  name: 'Client Demo Nimbus',
  email: 'demo@venio.com',
  password: 'losange',
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

const sampleProjects = [
  {
    name: 'Refonte site vitrine',
    summary: 'Moderniser l\'image et améliorer la conversion.',
    description: 'Refonte complète du site web avec une nouvelle charte graphique moderne, amélioration de l\'expérience utilisateur et optimisation du parcours de conversion. Intégration de nouvelles fonctionnalités et optimisation SEO.',
    status: 'EN_COURS',
    priority: 'HAUTE',
    serviceTypes: ['Design', 'Développement', 'UX/UI', 'SEO'],
    deliverableTypes: ['Maquettes', 'Code source', 'Documentation technique', 'Guide de style'],
    tags: ['refonte', 'urgent', 'web', 'responsive'],
    budget: { amount: 12000, currency: 'EUR', note: 'Budget validé par la direction' },
    billing: { amountInvoiced: 4000, billingStatus: 'PARTIEL', quoteReference: 'DEV-2024-001' },
    startDate: nowMinusDays(15),
    endDate: nowPlusDays(45),
    reminderAt: nowPlusDays(10),
    responsible: 'Sophie Martin - Chef de projet',
    deadlines: [
      { label: 'Kickoff réalisé', dueAt: nowMinusDays(15) },
      { label: 'Validation maquettes', dueAt: nowPlusDays(5) },
      { label: 'Développement phase 1', dueAt: nowPlusDays(25) },
      { label: 'Tests et recette', dueAt: nowPlusDays(40) },
      { label: 'Mise en production', dueAt: nowPlusDays(45) },
    ],
  },
  {
    name: 'Campagne acquisition Q2',
    summary: 'Booster les leads via ads et landing pages.',
    description: 'Stratégie d\'acquisition complète incluant la création de landing pages optimisées, campagnes Google Ads et Meta Ads, tracking et analyse des performances. Objectif : générer 500 leads qualifiés.',
    status: 'EN_ATTENTE',
    priority: 'NORMALE',
    serviceTypes: ['Conseil', 'Marketing', 'Communication'],
    deliverableTypes: ['Rapport', 'Contenu', 'Landing pages', 'Tableaux de bord'],
    tags: ['acquisition', 'ads', 'marketing digital'],
    budget: { amount: 6500, currency: 'EUR', note: 'Budget mensuel sur 3 mois' },
    billing: { amountInvoiced: null, billingStatus: 'NON_FACTURE', quoteReference: 'MKT-2024-012' },
    startDate: nowPlusDays(10),
    endDate: nowPlusDays(100),
    reminderAt: nowPlusDays(8),
    responsible: 'Thomas Dubois - Responsable Marketing',
    deadlines: [
      { label: 'Brief et stratégie', dueAt: nowPlusDays(12) },
      { label: 'Création landing pages', dueAt: nowPlusDays(25) },
      { label: 'Lancement campagnes', dueAt: nowPlusDays(30) },
      { label: 'Rapport mensuel 1', dueAt: nowPlusDays(60) },
      { label: 'Optimisation', dueAt: nowPlusDays(75) },
      { label: 'Rapport final', dueAt: nowPlusDays(100) },
    ],
  },
  {
    name: 'Plateforme e-commerce complète',
    summary: 'Création d\'une boutique en ligne moderne et performante.',
    description: 'Développement d\'une plateforme e-commerce sur mesure avec gestion des produits, panier, paiement sécurisé (Stripe), gestion des commandes, espace client, système de fidélité, et intégration avec le système de gestion des stocks. Interface d\'administration complète pour la gestion quotidienne.',
    status: 'EN_COURS',
    priority: 'URGENTE',
    serviceTypes: ['Développement', 'Design', 'UX/UI', 'Intégration', 'Conseil'],
    deliverableTypes: ['Code source', 'Maquettes', 'Documentation technique', 'Formation', 'Guide utilisateur'],
    tags: ['ecommerce', 'prioritaire', 'paiement', 'boutique', 'stripe'],
    budget: { amount: 28500, currency: 'EUR', note: 'Budget total incluant hébergement première année' },
    billing: { amountInvoiced: 14250, billingStatus: 'PARTIEL', quoteReference: 'ECOM-2024-003' },
    startDate: nowMinusDays(30),
    endDate: nowPlusDays(60),
    reminderAt: nowPlusDays(5),
    responsible: 'Alexandre Petit - Lead Developer',
    deadlines: [
      { label: 'Analyse des besoins', dueAt: nowMinusDays(28) },
      { label: 'Architecture technique', dueAt: nowMinusDays(20) },
      { label: 'Maquettes validées', dueAt: nowMinusDays(10) },
      { label: 'MVP - Fonctionnalités de base', dueAt: nowPlusDays(15) },
      { label: 'Intégration paiement', dueAt: nowPlusDays(30) },
      { label: 'Tests utilisateurs', dueAt: nowPlusDays(45) },
      { label: 'Formation équipe', dueAt: nowPlusDays(55) },
      { label: 'Mise en production', dueAt: nowPlusDays(60) },
    ],
  },
  {
    name: 'Identité de marque & Branding',
    summary: 'Création d\'une identité visuelle forte et cohérente.',
    description: 'Développement complet de l\'identité de marque : création du logo, définition de la charte graphique, choix des couleurs et typographies, création de templates pour réseaux sociaux, cartes de visite, papeterie, et guide de marque détaillé. Positionnement stratégique et storytelling de la marque.',
    status: 'TERMINE',
    priority: 'BASSE',
    serviceTypes: ['Design', 'Stratégie', 'Communication'],
    deliverableTypes: ['Assets', 'Rapport', 'Guide de marque', 'Templates'],
    tags: ['branding', 'identité', 'logo', 'charte graphique'],
    budget: { amount: 8500, currency: 'EUR', note: 'Projet terminé et facturé' },
    billing: { amountInvoiced: 8500, billingStatus: 'FACTURE', quoteReference: 'BRD-2023-089' },
    startDate: nowMinusDays(90),
    endDate: nowMinusDays(30),
    deliveredAt: nowMinusDays(28),
    reminderAt: null,
    responsible: 'Claire Rousseau - Directrice Artistique',
    deadlines: [
      { label: 'Atelier de positionnement', dueAt: nowMinusDays(88) },
      { label: 'Propositions de logo', dueAt: nowMinusDays(75) },
      { label: 'Validation logo final', dueAt: nowMinusDays(65) },
      { label: 'Charte graphique complète', dueAt: nowMinusDays(50) },
      { label: 'Déclinaisons et templates', dueAt: nowMinusDays(35) },
      { label: 'Livraison finale', dueAt: nowMinusDays(30) },
    ],
  },
]

async function seedSingleClient(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const existing = await User.findOne({ email: demoClient.email })
  if (existing) {
    await Project.deleteMany({ client: existing._id })
    await User.deleteOne({ _id: existing._id })
  }

  const passwordHash = await bcrypt.hash(demoClient.password, 10)

  const client = await User.create({
    name: demoClient.name,
    email: demoClient.email,
    passwordHash,
    role: 'CLIENT',
  })

  const projects = sampleProjects.map((proj, index) => ({
    ...proj,
    client: client._id,
    projectNumber: `VENIO-2024-${String(index + 1).padStart(3, '0')}`,
    internalNotes: 'Client fictif généré automatiquement pour démonstration.',
  }))

  await Project.insertMany(projects)

  console.log(`Seed OK: 1 client, ${projects.length} projets`)
  console.log(`Login: ${demoClient.email}`)
  console.log(`Password: ${demoClient.password}`)
  console.log(`\nProjets créés:`)
  projects.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.status}) - ${p.serviceTypes.length} services`)
  })

  await mongoose.disconnect()
}

seedSingleClient().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
