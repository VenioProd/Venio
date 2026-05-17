import './types/express.js'

import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import documentRoutes from './routes/documents.js'
import adminUserRoutes from './routes/admin/users.js'
import adminClientRoutes from './routes/admin/clients/index.js'
import adminAdminsRoutes from './routes/admin/admins.js'
import adminProjectRoutes from './routes/admin/projects.js'
import adminProjectSectionsRoutes from './routes/admin/projectSections.js'
import adminProjectItemsRoutes from './routes/admin/projectItems.js'
import adminBillingRoutes from './routes/admin/billing.js'
import adminCrmRoutes from './routes/admin/crm.js'
import adminTaskRoutes from './routes/admin/tasks/index.js'
import adminNotificationRoutes from './routes/admin/notifications.js'
import adminDashboardRoutes from './routes/admin/dashboard.js'
import adminSearchRoutes from './routes/admin/search.js'
import adminTemplateRoutes from './routes/admin/templates.js'
import adminAnalyticsRoutes from './routes/admin/analytics.js'
import adminCalendarRoutes from './routes/admin/calendar.js'
import adminMessageRoutes from './routes/admin/messages.js'
import adminAuditRoutes from './routes/admin/audit.js'
import adminTwoFactorRoutes from './routes/admin/twoFactor.js'
import adminBackupRoutes from './routes/admin/backup.js'
import adminQualiopiRoutes from './routes/admin/qualiopi.js'
import adminQualiopiQuestRoutes from './routes/admin/qualiopiQuestionnaires.js'
import publicQuestionnaireRoutes from './routes/public/questionnaire.js'
import adminTicketRoutes from './routes/admin/tickets.js'
import adminGestionRoutes from './routes/admin/gestion.js'
import adminBriefRoutes from './routes/admin/briefs.js'
import adminToolAccessRoutes from './routes/admin/toolAccess.js'
import adminAutomationRoutes from './routes/admin/automations.js'
import adminInternRoutes from './routes/admin/interns.js'
import adminEmailComposerRoutes from './routes/admin/emailComposer.js'
import adminInternalProjectRoutes from './routes/admin/internalProjects.js'
import adminArrowPilotageRoutes from './routes/admin/arrowPilotage.js'
import adminArrowProspectionRoutes from './routes/admin/arrowProspection.js'
import adminResourceRoutes from './routes/admin/resources.js'
import adminAccountingRoutes from './routes/admin/accounting/index.js'
import adminAgentTokenRoutes from './routes/admin/agentTokens.js'
import externalRoutes from './routes/external.js'
import agentRoutes from './routes/agent/index.js'
import adminMessagingRoutes from './routes/admin/messaging.js'
import clientProjectContentRoutes from './routes/client/projectContent.js'
import clientMessageRoutes from './routes/client/messages.js'
import { initInternalMessagingSocket } from './realtime/internalMessagingSocket.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import Project from './models/Project.js'
import Lead from './models/Lead.js'
import LeadActivity from './models/LeadActivity.js'
import ClientActivity from './models/ClientActivity.js'
import { startScheduler } from './lib/crmScheduler.js'
import { initAutomationEngine } from './automation/index.js'
import { startAutoLockScheduler } from './lib/accounting/autoLock.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const isProd = process.env.NODE_ENV === 'production'
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5001'

if (!mongoUri) {
  throw new Error('MONGODB_URI is required')
}

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://api.emailjs.com"],
      frameSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  } : false,
}))

// Force HTTPS in production
if (isProd) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`)
    }
    next()
  })
}

// Compression
app.use(compression())

// CORS
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
)

// Global rate limit: 200 requests per minute per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, veuillez réessayer dans un instant.' },
}))

// Routes des sources externes (Arrow, ecom-bcg, etc.).
// IMPORTANT : ce router est monté AVANT express.json() car la vérification
// HMAC nécessite le raw body en bytes. Le router gère son propre body parsing
// via express.raw() puis parse manuellement le JSON.
app.use('/api/external', externalRoutes)

// API agent : limite body plus haute (8mb) pour permettre l'upload de documents
// en base64 (jusqu'à ~5 Mo bruts ≈ 6.7 Mo encodés). Doit être monté AVANT
// le express.json global sinon le parser global rejette à 2mb d'abord.
app.use('/api/v1/agent', express.json({ limit: '8mb' }), agentRoutes)

app.use(express.json({ limit: '2mb' }))
app.use(morgan(isProd ? 'combined' : 'dev'))

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

// Strict rate limit on auth: 10 requests per minute
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, veuillez réessayer dans une minute.' },
})
app.use('/api/auth', authLimiter, authRoutes)

app.use('/api/projects', projectRoutes)
app.use('/api/documents', documentRoutes)

app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/clients', adminClientRoutes)
app.use('/api/admin/admins', adminAdminsRoutes)
app.use('/api/admin/projects', adminProjectRoutes)
app.use('/api/admin/projects', adminProjectSectionsRoutes)
app.use('/api/admin/projects', adminProjectItemsRoutes)
app.use('/api/admin/billing', adminBillingRoutes)
app.use('/api/admin/crm', adminCrmRoutes)
app.use('/api/admin/projects', adminTaskRoutes)
app.use('/api/admin/notifications', adminNotificationRoutes)
app.use('/api/admin/dashboard', adminDashboardRoutes)
app.use('/api/admin/search', adminSearchRoutes)
app.use('/api/admin/templates', adminTemplateRoutes)
app.use('/api/admin/analytics', adminAnalyticsRoutes)
app.use('/api/admin/calendar', adminCalendarRoutes)
app.use('/api/admin/projects', adminMessageRoutes)
app.use('/api/admin/audit', adminAuditRoutes)
app.use('/api/admin/2fa', adminTwoFactorRoutes)
app.use('/api/admin/backups', adminBackupRoutes)
app.use('/api/admin/qualiopi', adminQualiopiRoutes)
app.use('/api/admin/qualiopi-questionnaires', adminQualiopiQuestRoutes)
app.use('/api/questionnaire', publicQuestionnaireRoutes)
app.use('/api/admin/tickets', adminTicketRoutes)
app.use('/api/admin/gestion', adminGestionRoutes)
app.use('/api/admin/briefs', adminBriefRoutes)
app.use('/api/admin/tool-access', adminToolAccessRoutes)
app.use('/api/admin/automations', adminAutomationRoutes)
app.use('/api/admin/interns', adminInternRoutes)
app.use('/api/admin/email-composer', adminEmailComposerRoutes)
app.use('/api/admin/internal-projects', adminInternalProjectRoutes)
app.use('/api/admin/arrow-pilotage', adminArrowPilotageRoutes)
app.use('/api/admin/arrow-prospection', adminArrowProspectionRoutes)
app.use('/api/admin/resources', adminResourceRoutes)
app.use('/api/admin/accounting', adminAccountingRoutes)
app.use('/api/admin/messaging', adminMessagingRoutes)

// Gestion des tokens d'API agent (admin JWT) — UI : /admin/agents.
// NB : l'API agent elle-même (/api/v1/agent) est montée plus haut, AVANT le
// express.json global, pour autoriser un body plus volumineux (upload base64).
app.use('/api/admin/agent-tokens', adminAgentTokenRoutes)

// Routes client pour le contenu des projets
app.use('/api/projects', clientProjectContentRoutes)
app.use('/api/projects', clientMessageRoutes)

// Serve frontend static files in production
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir, { redirect: false }))
app.get('{*path}', (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

// Global error handler — hide stack traces in production
app.use((err: Error & { status?: number; errors?: unknown[] }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500

  if (!isProd) {
    console.error(err)
  }

  res.status(status).json({
    error: status >= 500 && isProd ? 'Erreur interne du serveur' : (err.message || 'Server error'),
    ...(status === 400 && err.errors ? { errors: err.errors } : {}),
  })
})

mongoose
  .connect(mongoUri)
  .then(async () => {
    // Ensure main SUPER_ADMIN account exists
    const adminEmail = process.env.SUPER_ADMIN_EMAIL
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD
    if (!adminEmail || !adminPassword) {
      console.log('ℹ️  SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set, skipping admin bootstrap')
    }
    const mainAdmin = adminEmail ? await User.findOne({ email: adminEmail }) : null
    if (!mainAdmin && adminEmail && adminPassword) {
      const passwordHash = await bcrypt.hash(adminPassword, 10)
      await User.create({
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        name: process.env.SUPER_ADMIN_NAME || 'Marie-Blanche',
      })
      console.log(`✅ SUPER_ADMIN account created (${adminEmail})`)
    } else if (mainAdmin && mainAdmin.role !== 'SUPER_ADMIN') {
      mainAdmin.role = 'SUPER_ADMIN'
      await mainAdmin.save()
    }

    // One-time migration: remove plainPassword field from all users
    const migrated = await User.updateMany(
      { plainPassword: { $exists: true } },
      { $unset: { plainPassword: '' } }
    )
    if (migrated.modifiedCount > 0) {
      console.log(`🔒 Removed plainPassword from ${migrated.modifiedCount} user(s)`)
    }

    // Cleanup fictional/test data
    const testAdminEmails = [
      'hugo@venio.paris',
      'ines@venio.paris',
      'maxime@venio.paris',
    ]
    // Demo client emails from seed scripts
    const testClientPatterns = [
      /@demo\.local$/,
      /@venio-fictif\.local$/,
    ]
    const testClientExact = [
      'demo@venio.com',
      't.bernard@agencelumiere.com',
      'c.roux@ecosolutions.eu',
      'marie.dupont@techvision.fr',
      'julie@startupflow.io',
      'p.lefebvre@maisonverte.fr',
      'sophie@digitalfirst.co',
      'lucas@studionord.fr',
      'n.simon@datadrive.io',
      'emma@artetcie.com',
      'a.girard@scaleuplab.com',
    ]

    // Find all test users
    const testAdmins = await User.find({ email: { $in: testAdminEmails } })
    const testClients = await User.find({
      $or: [
        { email: { $in: testClientExact } },
        { email: { $regex: '@demo\\.local$' } },
        { email: { $regex: '@venio-fictif\\.local$' } },
      ],
    })
    const allTestUsers = [...testAdmins, ...testClients]
    const allTestUserIds = allTestUsers.map((u) => u._id)

    if (allTestUserIds.length > 0) {
      // Delete projects belonging to test clients
      const deletedProjects = await Project.deleteMany({ client: { $in: allTestUserIds } })
      // Delete client activities
      await ClientActivity.deleteMany({ clientId: { $in: allTestUserIds } })
      // Delete the test users
      const deletedUsers = await User.deleteMany({ _id: { $in: allTestUserIds } })
      console.log(`🧹 Cleaned up ${deletedUsers.deletedCount} test account(s), ${deletedProjects.deletedCount} project(s)`)
    }

    // Delete demo leads (from seedDemoData)
    const demoLeadCompanies = [
      'TechVision SAS', 'Agence Lumière', 'Startup Flow', 'Maison Verte',
      'Digital First', 'Studio Nord', 'Eco Solutions', 'DataDrive',
      'Art & Cie', 'Scale Up Lab',
    ]
    const demoLeads = await Lead.find({ company: { $in: demoLeadCompanies } })
    if (demoLeads.length > 0) {
      const leadIds = demoLeads.map((l) => l._id)
      await LeadActivity.deleteMany({ leadId: { $in: leadIds } })
      const deletedLeads = await Lead.deleteMany({ _id: { $in: leadIds } })
      console.log(`🧹 Cleaned up ${deletedLeads.deletedCount} demo lead(s)`)
    }

    // Delete any remaining fictional projects (from seedClientProjects)
    const fictionalProjects = await Project.deleteMany({
      $or: [
        { internalNotes: { $regex: /fictif/i } },
        { internalNotes: { $regex: /seed/i } },
        { projectNumber: { $regex: /^PROJ-DEMO-/ } },
      ],
    })
    if (fictionalProjects.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${fictionalProjects.deletedCount} fictional project(s)`)
    }
  })
  .then(() => {
    const server = createServer(app)
    initInternalMessagingSocket(server, corsOrigin)
    server.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
      // Start CRM automation scheduler (legacy)
      startScheduler()
      // Start new automation engine
      initAutomationEngine()
      // Verrouillage automatique des écritures comptables VALIDATED expirées
      startAutoLockScheduler()
    })
  })
  .catch((err: unknown) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
