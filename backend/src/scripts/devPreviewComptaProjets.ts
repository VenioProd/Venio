/**
 * PREVIEW LOCALE de l'espace comptabilité par projet — non destiné à la prod.
 * Monte un MongoDB en mémoire en replica set (les transactions l'exigent),
 * démarre le serveur, puis rejoue le scénario chiffré du cadrage
 * (docs/comptabilite-projets/cadrage.md, § 4) sur « Projet Démo ».
 *
 *   npx tsx src/scripts/devPreviewComptaProjets.ts
 *
 * Login : contact@venio.paris / Preview1234!
 * Chiffres attendus : HT encaissé 874,90 €, freelance dû 272,87 € / restant 156,21 €,
 * coûts directs 200,00 €, marge 674,90 €.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server'

const mem = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
process.env.MONGODB_URI = mem.getUri('venio')
process.env.JWT_SECRET = 'dev-preview-secret-key-not-for-prod'
process.env.NODE_ENV = 'development'
process.env.CORS_ORIGIN = 'http://localhost:5501'
process.env.PORT = '3000'
process.env.SUPER_ADMIN_EMAIL = 'contact@venio.paris'
process.env.SUPER_ADMIN_PASSWORD = 'Preview1234!'
process.env.SUPER_ADMIN_NAME = 'Raphael'
process.env.CREDENTIALS_KEY = 'dev-preview-credentials-key'

await import('../index.js')

const mongoose = (await import('mongoose')).default
const bcrypt = (await import('bcryptjs')).default
const User = (await import('../models/User.js')).default
const Project = (await import('../models/Project.js')).default
const ChartOfAccount = (await import('../models/ChartOfAccount.js')).default
const Journal = (await import('../models/Journal.js')).default
const VatRate = (await import('../models/VatRate.js')).default
const Beneficiary = (await import('../models/Beneficiary.js')).default
const ProjectFinance = (await import('../models/ProjectFinance.js')).default
const ShareRuleVersion = (await import('../models/ShareRuleVersion.js')).default
const BillingDocument = (await import('../models/BillingDocument.js')).default
const { seedAccountingDefaults } = await import('../lib/accounting/pcgSeed.js')
const { generateInstallmentInvoices, generateSubscriptionInvoices } = await import('../lib/projectFinance/invoicing.js')
const { issueProjectInvoice } = await import('../lib/projectFinance/issueInvoice.js')
const { recordPayment, recordRefund } = await import('../lib/projectFinance/payments.js')
const { recordSettlement, recordProjectCost } = await import('../lib/projectFinance/settlements.js')

async function waitForAdmin() {
  for (let i = 0; i < 60; i++) {
    if (mongoose.connection.readyState === 1) {
      const admin = await User.findOne({ email: 'contact@venio.paris' })
      if (admin) return admin
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('[preview] SUPER_ADMIN introuvable')
}

const admin = await waitForAdmin()
const userId = String(admin._id)
await seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })

const passwordHash = await bcrypt.hash('Preview1234!', 10)
const [client, commercialUser] = await User.create([
  { name: 'Client Démo', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  { name: 'Camille Commerciale', email: 'commercial@example.test', passwordHash, role: 'COMMERCIAL' },
])
const project = await Project.create({ name: 'Projet Démo', client: client!._id, status: 'EN_COURS' })

const [commercial, freelance, apporteur, associeA, associeB] = await Beneficiary.create([
  {
    kind: 'COMMERCIAL',
    user: commercialUser!._id,
    displayName: 'Camille Commerciale',
    defaultAccountCode: '622600',
    settlementMode: 'PAIE',
  },
  {
    kind: 'FREELANCE',
    displayName: 'Studio Freelance',
    vatRegistered: true,
    defaultAccountCode: '604000',
    settlementMode: 'BANQUE',
  },
  { kind: 'APPORTEUR', displayName: 'Apporteur Démo', defaultAccountCode: '622600', settlementMode: 'BANQUE' },
  { kind: 'ASSOCIE', displayName: 'Associé A', defaultAccountCode: '455000', settlementMode: 'BANQUE' },
  { kind: 'ASSOCIE', displayName: 'Associé B', defaultAccountCode: '455000', settlementMode: 'BANQUE' },
])

const finance = await ProjectFinance.create({
  project: project._id,
  mode: 'ECHEANCIER',
  contractHtCents: 999999,
  vatRateBp: 2000,
  shareActivationDate: new Date('2026-09-01'),
  installments: [
    { label: 'Acompte', percentBp: 3333, trigger: { kind: 'DATE', dueDate: new Date('2026-09-15') } },
    { label: 'Jalon maquettes', percentBp: 3333, trigger: { kind: 'DATE', dueDate: new Date('2026-11-15') } },
    { label: 'Solde', percentBp: 3334, trigger: { kind: 'DATE', dueDate: new Date('2027-01-15') } },
  ],
  payers: [
    {
      kind: 'THIRD_PARTY',
      shareBp: 7000,
      isPrincipal: false,
      paymentMethod: 'VIREMENT',
      billingContact: { name: 'OPCO Démo', email: 'facturation@opco.example.test', city: 'Paris' },
    },
    { kind: 'CLIENT', user: client!._id, shareBp: 3000, isPrincipal: true, paymentMethod: 'VIREMENT' },
  ],
})

const rule = (beneficiary: { _id: unknown }, bp: number) => ({ beneficiary: beneficiary._id, bp })
await ShareRuleVersion.create({
  project: project._id,
  version: 1,
  effectiveFrom: new Date('2026-09-01'),
  reason: 'Répartition initiale',
  createdBy: admin._id,
  rules: [
    rule(commercial!, 1000),
    rule(freelance!, 3500),
    rule(apporteur!, 500),
    rule(associeA!, 2000),
    rule(associeB!, 2000),
  ],
})

const { invoices } = await generateInstallmentInvoices({
  projectId: String(project._id),
  installmentId: String(finance.installments[0]!._id),
  userId,
})
for (const invoice of invoices) {
  const doc = (await BillingDocument.findById(invoice._id))!
  doc.issuedAt = new Date('2026-09-20')
  doc.dueAt = new Date('2026-10-20')
  await issueProjectInvoice(doc, 'uploads/preview.pdf', userId)
}
const clientInvoice = invoices.find((invoice) => invoice.payer?.kind === 'CLIENT')!

const e1 = await recordPayment({
  invoiceId: String(clientInvoice._id),
  amountTtcCents: 40000,
  method: 'VIREMENT',
  receivedAt: '2026-10-01',
  reference: 'VIR-E1',
  idempotencyKey: 'preview-e1',
  userId,
})
await ShareRuleVersion.create({
  project: project._id,
  version: 2,
  effectiveFrom: new Date('2026-10-10'),
  reason: 'Freelance à 30 %',
  createdBy: admin._id,
  rules: [
    rule(commercial!, 1000),
    rule(freelance!, 3000),
    rule(apporteur!, 500),
    rule(associeA!, 2000),
    rule(associeB!, 2000),
  ],
})
await recordPayment({
  invoiceId: String(clientInvoice._id),
  amountTtcCents: 40000,
  method: 'VIREMENT',
  receivedAt: '2026-10-15',
  reference: 'VIR-E2',
  idempotencyKey: 'preview-e2',
  userId,
})
await recordPayment({
  invoiceId: String(clientInvoice._id),
  amountTtcCents: 39988,
  method: 'VIREMENT',
  receivedAt: '2026-10-20',
  reference: 'VIR-E3',
  idempotencyKey: 'preview-e3',
  userId,
})
await recordRefund({
  paymentId: String(e1.payment._id),
  amountTtcCents: 15000,
  receivedAt: '2026-10-22',
  reason: 'Geste commercial',
  idempotencyKey: 'preview-refund',
  userId,
})
await recordSettlement({
  beneficiaryId: String(freelance!._id),
  projectId: String(project._id),
  htCents: 11666,
  vatCents: 2333,
  paidAt: '2026-10-23',
  invoiceRef: 'FL-0042',
  idempotencyKey: 'preview-settlement',
  userId,
})
await recordProjectCost({
  projectId: String(project._id),
  accountCode: '626500',
  label: 'Licences et hébergement',
  supplier: 'Hébergeur Démo',
  htCents: 20000,
  vatCents: 4000,
  date: '2026-10-05',
  idempotencyKey: 'preview-cost',
  userId,
})

const subscriptionProject = await Project.create({ name: 'Maintenance Démo', client: client!._id, status: 'EN_COURS' })
await ProjectFinance.create({
  project: subscriptionProject._id,
  mode: 'ABONNEMENT',
  contractHtCents: null,
  vatRateBp: 2000,
  subscription: { amountHtCents: 15000, period: 'MONTHLY', startDate: new Date('2026-08-01') },
  payers: [{ kind: 'CLIENT', user: client!._id, shareBp: 10000, isPrincipal: true, paymentMethod: 'PRELEVEMENT' }],
})
await generateSubscriptionInvoices({ projectId: String(subscriptionProject._id), now: new Date(), userId })

console.log(
  `[preview] Projet Démo : /admin/projets/${project._id} — Maintenance Démo : /admin/projets/${subscriptionProject._id}`,
)
console.log('[preview] Prêt. Login contact@venio.paris / Preview1234! (commercial@example.test pour « Mon relevé »)')
