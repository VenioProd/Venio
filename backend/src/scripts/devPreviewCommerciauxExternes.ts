/**
 * PREVIEW LOCALE de l'espace commerciaux externes — non destiné à la prod.
 * MongoDB en mémoire en replica set (les encaissements sont transactionnels),
 * puis deux externes, un closer et un client signé avec un encaissement.
 *
 *   npx tsx backend/src/scripts/devPreviewCommerciauxExternes.ts
 *
 * Mot de passe commun : Preview1234!
 *   contact@venio.paris (super-admin) · alex@example.test (closer)
 *   anna@example.test et bruno@example.test (commerciaux externes, via /admin/login)
 * Chiffres attendus pour Anna : 1 000,00 € HT encaissé, 100,00 € de commission due.
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
const Lead = (await import('../models/Lead.js')).default
const Project = (await import('../models/Project.js')).default
const BillingDocument = (await import('../models/BillingDocument.js')).default
const CrmSettings = (await import('../models/CrmSettings.js')).default
const ChartOfAccount = (await import('../models/ChartOfAccount.js')).default
const Journal = (await import('../models/Journal.js')).default
const VatRate = (await import('../models/VatRate.js')).default
const { seedAccountingDefaults } = await import('../lib/accounting/pcgSeed.js')
const { recordPayment } = await import('../lib/projectFinance/payments.js')
const { logLeadActivity } = await import('../lib/crmAutomations.js')

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
await seedAccountingDefaults({ ChartOfAccount, Journal, VatRate })

const passwordHash = await bcrypt.hash('Preview1234!', 10)
const [alex, anna, bruno] = await User.create([
  { name: 'Alex Closer', email: 'alex@example.test', passwordHash, role: 'ADMIN' },
  { name: 'Anna Externe', email: 'anna@example.test', passwordHash, role: 'COMMERCIAL_EXTERNE' },
  { name: 'Bruno Externe', email: 'bruno@example.test', passwordHash, role: 'COMMERCIAL_EXTERNE' },
])
await CrmSettings.updateSettings({ defaultCloserId: alex!._id } as never)

const lead = (company: string, rep: typeof anna, extra: Record<string, unknown> = {}) =>
  Lead.create({ company, externalRep: rep!._id, assignedTo: rep!._id, createdBy: rep!._id, ...extra })

const [, , signed] = await Promise.all([
  lead('Atelier Lumière', anna, { contactName: 'Lucie Martin', status: 'DEMO', nextActionAt: new Date() }),
  lead('Cave des Coteaux', anna, {
    status: 'DEMO',
    assignedTo: alex!._id,
    closingHandoff: { at: new Date(), to: alex!._id, by: anna!._id },
  }),
  lead('Boulangerie Fournil', anna, { status: 'WON', contactName: 'Paul Fournier' }),
  lead('Garage du Port', bruno, { status: 'CONTACTED' }),
])
await logLeadActivity(signed._id, 'CREATED', 'Lead créé', {}, anna!._id)

const client = await User.create({
  name: 'Paul Fournier',
  companyName: 'Boulangerie Fournil',
  email: 'paul@fournil.example.test',
  passwordHash,
  role: 'CLIENT',
  originLead: signed._id,
})
await Lead.updateOne({ _id: signed._id }, { clientAccountId: client._id })
const project = await Project.create({ name: 'Site Fournil', client: client._id, status: 'EN_COURS' })
const invoice = await BillingDocument.create({
  type: 'INVOICE',
  number: 'FAC-PREVIEW-001',
  project: project._id,
  client: client._id,
  createdBy: admin._id,
  status: 'SENT',
  sentAt: new Date(),
  subtotal: 1000,
  taxTotal: 200,
  total: 1200,
  lines: [{ description: 'Site vitrine', quantity: 1, unitPrice: 1000, taxRate: 20, total: 1000 }],
})
await recordPayment({
  invoiceId: String(invoice._id),
  amountTtcCents: 120000,
  method: 'VIREMENT',
  receivedAt: new Date(),
  reference: 'Virement preview',
  idempotencyKey: 'preview-commerciaux-1',
  userId: String(admin._id),
})

console.log('[preview] Commerciaux externes prêts — anna@example.test / Preview1234! sur /admin/login')
