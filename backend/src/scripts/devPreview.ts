/**
 * Script de PREVIEW LOCALE — non destiné à la prod.
 * Monte un MongoDB en mémoire, configure l'env, démarre le serveur Express
 * (qui crée le SUPER_ADMIN), puis seede quelques filiales d'exemple.
 *
 *   npx tsx src/scripts/devPreview.ts
 *
 * Login : contact@venio.paris / Preview1234!
 */
import { MongoMemoryServer } from 'mongodb-memory-server'

const mem = await MongoMemoryServer.create()
const uri = mem.getUri('venio')

process.env.MONGODB_URI = uri
process.env.JWT_SECRET = 'dev-preview-secret-key-not-for-prod'
process.env.NODE_ENV = 'development'
process.env.CORS_ORIGIN = 'http://localhost:5501'
process.env.PORT = '3000'
process.env.SUPER_ADMIN_EMAIL = 'contact@venio.paris'
process.env.SUPER_ADMIN_PASSWORD = 'Preview1234!'
process.env.SUPER_ADMIN_NAME = 'Raphael'
process.env.CREDENTIALS_KEY = 'dev-preview-credentials-key'

console.log('[preview] MongoDB mémoire prêt:', uri)

// Démarre le serveur (connecte mongoose + bootstrap SUPER_ADMIN + listen)
await import('../index.js')

const mongoose = (await import('mongoose')).default
const User = (await import('../models/User.js')).default
const Subsidiary = (await import('../models/Subsidiary.js')).default
const { encryptSecret } = await import('../lib/secretBox.js')

async function waitFor<T>(fn: () => Promise<T | null>, label: string, tries = 40): Promise<T> {
  for (let i = 0; i < tries; i++) {
    if (mongoose.connection.readyState === 1) {
      const r = await fn()
      if (r) return r
    }
    await new Promise((res) => setTimeout(res, 500))
  }
  throw new Error(`[preview] timeout en attendant: ${label}`)
}

const admin = await waitFor(() => User.findOne({ email: 'contact@venio.paris' }), 'SUPER_ADMIN')
const adminId = (admin as any)._id

const existing = await Subsidiary.countDocuments()
if (existing === 0) {
  await Subsidiary.create([
    {
      name: 'Yumi',
      slug: 'yumi',
      sector: 'SaaS B2C',
      tagline: 'L’app qui simplifie le quotidien.',
      status: 'ACTIVE',
      health: 'GOOD',
      accentColor: '#6366f1',
      logoUrl: '/filiales/yumi.png',
      foundedYear: 2024,
      description: 'Produit SaaS grand public en forte croissance, modèle d’abonnement mensuel.',
      productDescription:
        'Yumi est une application mobile et web qui aide les particuliers à organiser leur quotidien : tâches, budget et rappels intelligents dans une seule interface.\n\nFonctionnalités clés :\n- Agenda unifié avec suggestions automatiques\n- Suivi de budget connecté\n- Rappels contextuels et widgets\n\nPositionnement : grand public, premium accessible.',
      serviceDescription:
        'Service en self-service (abonnement) + support premium par chat.\nOnboarding guidé en 3 étapes, base de connaissance et webinaires mensuels pour les power users.',
      businessModel:
        'Freemium → abonnement.\n- Gratuit : fonctions de base\n- Premium : 6,99 €/mois ou 59 €/an\n- Acquisition : ASO, contenu, parrainage\nMarge brute ~61 %, objectif 65 %. LTV/CAC visé > 3.',
      businessPlan:
        'Vision : devenir l’assistant quotidien de référence sur le marché francophone.\n\nJalons :\n- T3 2026 : 1 000 utilisateurs payants\n- T4 2026 : intégration bancaire complète\n- 2027 : ouverture marché européen\n\nBesoin de financement : 150 k€ pour accélérer l’acquisition et recruter 2 devs.',
      sections: [
        {
          title: 'Concurrence',
          content:
            'Concurrents directs : apps de productivité générralistes.\nDifférenciation : combinaison agenda + budget + IA contextuelle dans une UX simple.',
        },
        {
          title: 'Risques',
          content:
            '- Dépendance aux stores (commission 30 %)\n- Acquisition coûteuse si le bouche-à-oreille ralentit\n- Réglementaire sur l’agrégation bancaire (DSP2)',
        },
      ],
      lead: adminId,
      team: [adminId],
      linkedEntity: '',
      kpis: {
        caMtd: 42000,
        caMtdDelta: 12,
        margin: 61,
        marginTarget: 65,
        treasury: 128000,
        runwayMonths: 9,
        headcount: 5,
        headcountTarget: 6,
      },
      objective: { label: 'Utilisateurs payants', current: 740, target: 1000, unit: 'users' },
      links: [
        { type: 'repo', label: 'yumi-app', url: 'https://github.com/venio/yumi' },
        { type: 'production', label: 'yumi.app', url: 'https://yumi.app' },
        { type: 'staging', label: 'staging', url: 'https://staging.yumi.app' },
        { type: 'analytics', label: 'PostHog', url: 'https://posthog.com' },
        { type: 'hosting', label: 'Vercel', url: 'https://vercel.com' },
        { type: 'docs', label: 'Notion', url: 'https://notion.so' },
      ],
      infos: [
        { label: 'Statut juridique', value: 'SASU' },
        { label: 'SIRET', value: '900 123 456 00012' },
        { label: 'Banque', value: 'Qonto' },
        { label: 'Stack', value: 'React + Vite, Node/Express, MongoDB' },
        { label: 'Abonnements', value: 'Vercel Pro, PostHog, Stripe' },
      ],
      contacts: [
        {
          name: 'Raphael Bentvelzen',
          role: 'Lead / produit',
          email: 'contact@venio.paris',
          phone: '+33 6 12 34 56 78',
          notes: '',
        },
        { name: 'Sékou Koné', role: 'Dev', email: 'sekou@yumi.app', phone: '', notes: 'Back + intégrations' },
      ],
      credentials: [
        {
          category: 'admin',
          label: 'Admin Vercel',
          username: 'contact@venio.paris',
          secretEnc: encryptSecret('VercelDemo!2026'),
          url: 'https://vercel.com/login',
          notes: 'Compte propriétaire',
        },
        {
          category: 'api',
          label: 'Clé API Stripe (test)',
          username: '',
          secretEnc: encryptSecret('sk_test_demo_1234567890'),
          url: 'https://dashboard.stripe.com',
          notes: 'Mode test',
        },
      ],
      alerts: [{ label: 'Intégration Stripe bloquée depuis 4 jours', level: 'WARNING' }],
      tags: ['produit', 'b2c', 'mvp'],
      order: 1,
      createdBy: adminId,
    },
    {
      name: 'Arrow',
      slug: 'arrow',
      sector: 'École / prospection',
      tagline: 'Former et recruter les talents de demain.',
      status: 'ACTIVE',
      health: 'WATCH',
      accentColor: '#f59e0b',
      foundedYear: 2023,
      description: 'Programme de formation et de prospection commerciale.',
      lead: adminId,
      team: [adminId],
      linkedEntity: 'Arrow',
      kpis: {
        caMtd: 28000,
        caMtdDelta: 0,
        margin: 48,
        marginTarget: 55,
        treasury: 64000,
        runwayMonths: 6,
        headcount: 3,
        headcountTarget: 4,
      },
      objective: { label: 'Cohortes validées', current: 2, target: 5, unit: 'cohortes' },
      links: [{ label: 'Drive', url: 'https://drive.google.com' }],
      alerts: [],
      tags: ['école', 'prospection'],
      order: 2,
      createdBy: adminId,
    },
    {
      name: 'Jiraya',
      slug: 'jiraya',
      sector: 'Agence / studio',
      tagline: 'Studio créatif & technique.',
      status: 'INCUBATION',
      health: 'GOOD',
      accentColor: '#ec4899',
      logoUrl: '/filiales/jiraya.svg',
      foundedYear: 2025,
      description: 'Jeune studio en incubation, premières missions clients.',
      lead: adminId,
      team: [adminId],
      linkedEntity: '',
      kpis: {
        caMtd: 9000,
        caMtdDelta: 30,
        margin: 40,
        marginTarget: 50,
        treasury: 22000,
        runwayMonths: 4,
        headcount: 2,
        headcountTarget: 3,
      },
      objective: { label: 'Missions signées', current: 3, target: 10, unit: 'missions' },
      links: [{ label: 'Portfolio', url: 'https://jiraya.studio' }],
      alerts: [{ label: 'Trésorerie courte, surveiller le runway', level: 'INFO' }],
      tags: ['studio', 'créa'],
      order: 3,
      createdBy: adminId,
    },
  ])

  console.log('[preview] 3 filiales seedées (Yumi, Arrow, Jiraya).')
}

console.log('\n[preview] ✅ Prêt. Backend sur :3000 — login contact@venio.paris / Preview1234!\n')
