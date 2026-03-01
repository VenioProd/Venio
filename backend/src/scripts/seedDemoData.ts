import dotenv from 'dotenv'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import Project from '../models/Project.js'
import Lead from '../models/Lead.js'

dotenv.config()

const MONGO_URI = process.env.MONGODB_URI

if (!MONGO_URI) {
  console.error('MONGODB_URI is required')
  process.exit(1)
}

const demoDomain = 'demo.local'

const demoClients: { name: string; email: string }[] = [
  { name: 'Horizon Atelier', email: `contact@horizon.${demoDomain}` },
  { name: 'Nova Retail', email: `hello@novaretail.${demoDomain}` },
  { name: 'Maison Aurore', email: `bonjour@maisonaurore.${demoDomain}` },
  { name: 'Studio Kora', email: `team@studiokora.${demoDomain}` },
  { name: 'Lumen Santé', email: `contact@lumensante.${demoDomain}` },
]

interface SampleProject {
  name: string
  summary: string
  description: string
  status: string
  priority: string
  serviceTypes: string[]
  deliverableTypes: string[]
  tags: string[]
  budget: { amount: number; currency: string; note: string }
}

const sampleProjects: SampleProject[] = [
  {
    name: 'Refonte site vitrine',
    summary: 'Moderniser l\u2019image et améliorer la conversion.',
    description: 'Nouvelle charte et refonte UX/UI.',
    status: 'EN_COURS',
    priority: 'HAUTE',
    serviceTypes: ['Design', 'Développement'],
    deliverableTypes: ['Maquettes', 'Code source'],
    tags: ['refonte', 'urgent'],
    budget: { amount: 12000, currency: 'EUR', note: 'Budget validé' },
  },
  {
    name: 'Campagne acquisition Q2',
    summary: 'Booster les leads via ads et landing pages.',
    description: 'Plan média + landing pages optimisées.',
    status: 'EN_ATTENTE',
    priority: 'NORMALE',
    serviceTypes: ['Conseil', 'Marketing'],
    deliverableTypes: ['Rapport', 'Contenu'],
    tags: ['acquisition', 'ads'],
    budget: { amount: 6500, currency: 'EUR', note: '' },
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
  },
]

const nowPlusDays = (days: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

const CRM_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']

interface DemoLead {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  status: string
  priority: string
  budget: number | null
  notes: string
}

const demoLeads: DemoLead[] = [
  { company: 'TechVision SAS', contactName: 'Marie Dupont', contactEmail: 'marie.dupont@techvision.fr', contactPhone: '06 12 34 56 78', source: 'Site web', status: 'LEAD', priority: 'HAUTE', budget: 15000, notes: 'Intéressé par refonte + SEO.' },
  { company: 'Agence Lumière', contactName: 'Thomas Bernard', contactEmail: 't.bernard@agencelumiere.com', contactPhone: '01 23 45 67 89', source: 'Recommandation', status: 'QUALIFIED', priority: 'NORMALE', budget: 8000, notes: 'Projet branding Q2.' },
  { company: 'Startup Flow', contactName: 'Julie Martin', contactEmail: 'julie@startupflow.io', contactPhone: '07 98 76 54 32', source: 'LinkedIn', status: 'CONTACTED', priority: 'HAUTE', budget: 22000, notes: 'Démo prévue la semaine prochaine.' },
  { company: 'Maison Verte', contactName: 'Pierre Lefebvre', contactEmail: 'p.lefebvre@maisonverte.fr', contactPhone: '04 56 78 90 12', source: 'Salon', status: 'DEMO', priority: 'NORMALE', budget: 12000, notes: 'Démo effectuée, en attente de retour.' },
  { company: 'Digital First', contactName: 'Sophie Moreau', contactEmail: 'sophie@digitalfirst.co', contactPhone: '06 11 22 33 44', source: 'Site web', status: 'PROPOSAL', priority: 'URGENTE', budget: 18000, notes: 'Proposition envoyée, relance prévue.' },
  { company: 'Studio Nord', contactName: 'Lucas Petit', contactEmail: 'lucas@studionord.fr', contactPhone: '03 44 55 66 77', source: 'Recommandation', status: 'WON', priority: 'NORMALE', budget: 9500, notes: 'Signé le 15/01.' },
  { company: 'Eco Solutions', contactName: 'Claire Roux', contactEmail: 'c.roux@ecosolutions.eu', contactPhone: '', source: 'Cold call', status: 'LOST', priority: 'BASSE', budget: 5000, notes: 'Budget insuffisant, pas de suite.' },
  { company: 'DataDrive', contactName: 'Nicolas Simon', contactEmail: 'n.simon@datadrive.io', contactPhone: '06 77 88 99 00', source: 'LinkedIn', status: 'LEAD', priority: 'NORMALE', budget: null, notes: 'À qualifier.' },
  { company: 'Art & Cie', contactName: 'Emma Laurent', contactEmail: 'emma@artetcie.com', contactPhone: '01 98 87 76 65', source: 'Site web', status: 'QUALIFIED', priority: 'HAUTE', budget: 14000, notes: 'Projet identité + site.' },
  { company: 'Scale Up Lab', contactName: 'Alexandre Girard', contactEmail: 'a.girard@scaleuplab.com', contactPhone: '07 65 43 21 00', source: 'Salon', status: 'CONTACTED', priority: 'NORMALE', budget: 30000, notes: 'Premier échange positif.' },
]

async function seed(): Promise<void> {
  await mongoose.connect(MONGO_URI!)

  const existingDemoUsers = await User.find({ email: new RegExp(`@${demoDomain}$`) })
  const demoUserIds = existingDemoUsers.map((u) => u._id)
  if (demoUserIds.length) {
    await Project.deleteMany({ client: { $in: demoUserIds } })
    await User.deleteMany({ _id: { $in: demoUserIds } })
  }

  const passwordHash = await bcrypt.hash('password123', 10)

  const clients = await User.insertMany(
    demoClients.map((client) => ({
      name: client.name,
      email: client.email,
      passwordHash,
      role: 'CLIENT',
    }))
  )

  const projects: Record<string, unknown>[] = []
  clients.forEach((client, index) => {
    const baseIndex = index % sampleProjects.length
    const first = sampleProjects[baseIndex]
    const second = sampleProjects[(baseIndex + 1) % sampleProjects.length]
    const list = [first, second]

    list.forEach((proj, projIndex) => {
      projects.push({
        ...proj,
        client: client._id,
        projectNumber: `PROJ-DEMO-${String(index + 1).padStart(2, '0')}${projIndex + 1}`,
        startDate: nowPlusDays(2 + projIndex * 3),
        endDate: nowPlusDays(20 + projIndex * 7),
        deadlines: [
          { label: 'Kickoff', dueAt: nowPlusDays(2) },
          { label: 'Livraison', dueAt: nowPlusDays(30) },
        ],
        reminderAt: nowPlusDays(5),
        responsible: 'Commercial Demo',
        internalNotes: 'Client fictif généré automatiquement.',
      })
    })
  })

  await Project.insertMany(projects)

  const admin = await User.findOne({ role: { $in: ['SUPER_ADMIN', 'ADMIN', 'VIEWER'] } }).sort({ createdAt: 1 })
  if (admin) {
    const demoCompanyNames = demoLeads.map((l) => l.company)
    await Lead.deleteMany({ company: { $in: demoCompanyNames } })
    const leads = demoLeads.map((l, i) => ({
      ...l,
      createdBy: admin._id,
      assignedTo: admin._id,
      nextActionAt: l.status === 'LOST' || l.status === 'WON' ? null : nowPlusDays(3 + (i % 5)),
      lastContactAt: ['CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'].includes(l.status) ? nowPlusDays(-(i % 7)) : null,
    }))
    await Lead.insertMany(leads)
    console.log(`Seed OK: ${clients.length} clients, ${projects.length} projets, ${leads.length} prospects CRM`)
  } else {
    console.log(`Seed OK: ${clients.length} clients, ${projects.length} projets (aucun admin pour créer des prospects CRM)`)
  }

  await mongoose.disconnect()
}

seed().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
