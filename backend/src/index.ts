import './types/express.js'

import path from 'path'
import { fileURLToPath } from 'url'
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
import adminClientRoutes from './routes/admin/clients.js'
import adminAdminsRoutes from './routes/admin/admins.js'
import adminProjectRoutes from './routes/admin/projects.js'
import adminProjectSectionsRoutes from './routes/admin/projectSections.js'
import adminProjectItemsRoutes from './routes/admin/projectItems.js'
import adminBillingRoutes from './routes/admin/billing.js'
import adminCrmRoutes from './routes/admin/crm.js'
import adminTaskRoutes from './routes/admin/tasks.js'
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
import clientProjectContentRoutes from './routes/client/projectContent.js'
import clientMessageRoutes from './routes/client/messages.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import { startScheduler } from './lib/crmScheduler.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const isProd = process.env.NODE_ENV === 'production'

if (!mongoUri) {
  throw new Error('MONGODB_URI is required')
}

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}))

// Compression
app.use(compression())

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5001',
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

// Routes client pour le contenu des projets
app.use('/api/projects', clientProjectContentRoutes)
app.use('/api/projects', clientMessageRoutes)

// Serve frontend static files in production
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir))
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
    const mainAdmin = await User.findOne({ email: 'gbamelesami102@gmail.com' })
    if (!mainAdmin) {
      const passwordHash = await bcrypt.hash('Venio@2026!', 10)
      await User.create({
        email: 'gbamelesami102@gmail.com',
        passwordHash,
        role: 'SUPER_ADMIN',
        name: 'Marie-Blanche',
      })
      console.log('✅ SUPER_ADMIN account created (gbamelesami102@gmail.com)')
    } else if (mainAdmin.role !== 'SUPER_ADMIN') {
      mainAdmin.role = 'SUPER_ADMIN'
      await mainAdmin.save()
    }
  })
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`)
      // Start CRM automation scheduler
      startScheduler()
    })
  })
  .catch((err: unknown) => {
    console.error('MongoDB connection error:', err)
    process.exit(1)
  })
