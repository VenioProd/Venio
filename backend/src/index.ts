import './types/express.js'

import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { pinoHttp } from 'pino-http'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import logger from './lib/logger.js'

// Version applicative pour les health checks et les headers
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
const APP_VERSION = pkg.version

import authRoutes from './routes/auth.js'
import projectRoutes from './routes/projects.js'
import documentRoutes from './routes/documents.js'
import adminUserRoutes from './routes/admin/users.js'
import adminClientRoutes from './routes/admin/clients/index.js'
import adminAdminsRoutes from './routes/admin/admins.js'
// Router parent qui consolide tous les sous-routers sous /api/admin/projects
// (core, sections, items, tasks, messages) — avant ce refactor, 5 mounts distincts.
import adminProjectsRouter from './routes/admin/projects/index.js'
import adminBillingRoutes from './routes/admin/billing.js'
import adminCrmRoutes from './routes/admin/crm.js'
import adminNotificationRoutes from './routes/admin/notifications.js'
import pushRoutes from './routes/push.js'
import notificationPreferencesRoutes from './routes/notificationPreferences.js'
import adminDashboardRoutes from './routes/admin/dashboard.js'
import adminDecisionRoutes from './routes/admin/decisions.js'
import adminInboxRoutes from './routes/admin/inbox.js'
import adminSearchRoutes from './routes/admin/search.js'
import adminTemplateRoutes from './routes/admin/templates.js'
import adminAnalyticsRoutes from './routes/admin/analytics.js'
import adminCalendarRoutes from './routes/admin/calendar.js'
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
import adminInternRoutes from './routes/admin/interns/index.js'
import adminEmailComposerRoutes from './routes/admin/emailComposer.js'
import adminInternalProjectRoutes from './routes/admin/internalProjects.js'
import adminArrowPilotageRoutes from './routes/admin/arrowPilotage.js'
import adminArrowProspectionRoutes from './routes/admin/arrowProspection.js'
import adminSubsidiaryRoutes from './routes/admin/subsidiaries.js'
import adminResourceRoutes from './routes/admin/resources.js'
import adminAccountingRoutes from './routes/admin/accounting/index.js'
import adminAgentTokenRoutes from './routes/admin/agentTokens.js'
import adminDevRoutes from './routes/admin/dev/index.js'
import adminEducationRoutes from './routes/admin/education/index.js'
import avatarRoutes from './routes/avatars.js'
import externalRoutes from './routes/external.js'
import agentRoutes from './routes/agent/index.js'
import adminMessagingRoutes from './routes/admin/messaging.js'
import adminHealthRoutes from './routes/admin/health.js'
import adminActivityCenterRoutes from './routes/admin/activityCenter.js'
import adminWorkspaceRoutes from './routes/admin/workspace.js'
import clientProjectContentRoutes from './routes/client/projectContent.js'
import clientMessageRoutes from './routes/client/messages.js'
import { initInternalMessagingSocket } from './realtime/internalMessagingSocket.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import { startScheduler } from './lib/crmScheduler.js'
import { initAutomationEngine } from './automation/index.js'
import { startAutoLockScheduler } from './lib/accounting/autoLock.js'
import { initSentry, Sentry } from './lib/sentry.js'

dotenv.config()

// Sentry — appelé tout en haut pour permettre l'instrumentation auto. No-op si pas de DSN.
initSentry()

const app = express()
const port = process.env.PORT || 3000
const mongoUri = process.env.MONGODB_URI
const isProd = process.env.NODE_ENV === 'production'
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5001'

if (isProd) {
  app.set('trust proxy', 1)
}

if (!mongoUri) {
  throw new Error('MONGODB_URI is required')
}

// Security headers
// scriptSrc : pas de 'unsafe-inline' — l'app n'a aucun <script> inline (vérifié
// au chantier #6 : seuls des <script src="..."> dans index.html). Les CDN
// utilisés (three.js, vanta) sont explicitement listés. Si Sentry est activé,
// son origine est ajoutée à connectSrc.
const sentryIngest = process.env.SENTRY_DSN ? new URL(process.env.SENTRY_DSN).origin : null
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'https://api.emailjs.com', ...(sentryIngest ? [sentryIngest] : [])],
            frameSrc: ["'self'", 'blob:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false,
  }),
)

// Force HTTPS in production, but keep the local Docker healthcheck reachable.
if (isProd) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next()
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
  }),
)

// Global rate limit: 200 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, veuillez réessayer dans un instant.' },
  }),
)

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

// Logging requêtes — pino-http (remplace morgan)
import type { IncomingMessage, ServerResponse } from 'http'
app.use(
  pinoHttp({
    logger,
    customLogLevel: function (_req: IncomingMessage, res: ServerResponse, err?: Error) {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    // En prod : volumes élevés → on évite de logger les health checks et assets statiques
    autoLogging: {
      ignore: (req: IncomingMessage) => {
        const url = req.url ?? ''
        return url === '/api/health' || url.startsWith('/api/avatars/') || url.startsWith('/assets/')
      },
    },
  }),
)

// Healthcheck applicatif — ping Mongo + version. Non bloquant (Mongo down → status: degraded).
app.get('/api/health', async (_req: Request, res: Response) => {
  const mongoState = mongoose.connection.readyState
  const mongoOk = mongoState === 1
  let mongoPing: number | null = null
  if (mongoOk) {
    const start = Date.now()
    try {
      await mongoose.connection.db?.admin().ping()
      mongoPing = Date.now() - start
    } catch {
      // ping failed — fall through, status reflects mongoOk=false
    }
  }

  const overallOk = mongoOk && mongoPing !== null
  res.status(overallOk ? 200 : 503).json({
    status: overallOk ? 'ok' : 'degraded',
    version: APP_VERSION,
    uptime: Math.round(process.uptime()),
    mongo: { ok: mongoOk, state: mongoState, pingMs: mongoPing },
    checkedAt: new Date().toISOString(),
  })
})

// Login bruteforce : 5 tentatives /15 min /IP, skip success (compteur n'avance que sur 4xx/5xx)
// Plus strict que le quota général. Voir SECURITY.md.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
})
// Reset / forgot password : 3 demandes /15 min /IP (anti-énumération + anti-spam mail)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes. Réessayez dans 15 minutes.' },
})
// Quota global sur les autres endpoints /api/auth (signup, refresh, etc.) — 20/min
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, veuillez réessayer dans une minute.' },
})
app.use('/api/avatars', avatarRoutes)
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth/forgot-password', passwordResetLimiter)
app.use('/api/auth/reset-password', passwordResetLimiter)
app.use('/api/auth', authLimiter, authRoutes)

app.use('/api/projects', projectRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/notification-preferences', notificationPreferencesRoutes)

app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/clients', adminClientRoutes)
app.use('/api/admin/admins', adminAdminsRoutes)
// Un seul mount pour /api/admin/projects — voir routes/admin/projects/index.ts
app.use('/api/admin/projects', adminProjectsRouter)
app.use('/api/admin/billing', adminBillingRoutes)
app.use('/api/admin/crm', adminCrmRoutes)
app.use('/api/admin/notifications', adminNotificationRoutes)
app.use('/api/admin/dashboard', adminDashboardRoutes)
app.use('/api/admin/workspace', adminWorkspaceRoutes)
app.use('/api/admin/decisions', adminDecisionRoutes)
app.use('/api/admin/inbox', adminInboxRoutes)
app.use('/api/admin/search', adminSearchRoutes)
app.use('/api/admin/templates', adminTemplateRoutes)
app.use('/api/admin/analytics', adminAnalyticsRoutes)
app.use('/api/admin/calendar', adminCalendarRoutes)
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
app.use('/api/admin/subsidiaries', adminSubsidiaryRoutes)
app.use('/api/admin/resources', adminResourceRoutes)
app.use('/api/admin/accounting', adminAccountingRoutes)
app.use('/api/admin/messaging', adminMessagingRoutes)
app.use('/api/admin/health', adminHealthRoutes)
app.use('/api/admin/activity-center', adminActivityCenterRoutes)

// Gestion des tokens d'API agent (admin JWT) — UI : /admin/agents.
// NB : l'API agent elle-même (/api/v1/agent) est montée plus haut, AVANT le
// express.json global, pour autoriser un body plus volumineux (upload base64).
app.use('/api/admin/agent-tokens', adminAgentTokenRoutes)

// Dev workspace (suivi développement type Linear, séparé de Projets clients).
app.use('/api/admin/dev', adminDevRoutes)
app.use('/api/admin/education', adminEducationRoutes)

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

// Sentry error handler — doit être AVANT le notre, capture les erreurs avant qu'on les
// transforme en réponse JSON. No-op si Sentry désactivé (DSN absent).
Sentry.setupExpressErrorHandler(app)

// Global error handler — hide stack traces in production
app.use((err: Error & { status?: number; errors?: unknown[] }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500

  logger.error({ err, status }, 'Unhandled request error')

  res.status(status).json({
    error: status >= 500 && isProd ? 'Erreur interne du serveur' : err.message || 'Server error',
    ...(status === 400 && err.errors ? { errors: err.errors } : {}),
  })
})

mongoose
  .connect(mongoUri)
  .then(async () => {
    // Bootstrap SUPER_ADMIN — idempotent, vérifié à chaque démarrage.
    // Note : les migrations one-shot historiques (unset plainPassword, fix slug:null)
    // ont été sorties vers backend/scripts/migrations/. Voir le README de ce dossier.
    const adminEmail = process.env.SUPER_ADMIN_EMAIL
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD
    if (!adminEmail || !adminPassword) {
      logger.info('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set, skipping admin bootstrap')
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
      logger.info({ adminEmail }, 'SUPER_ADMIN account created')
    } else if (mainAdmin && mainAdmin.role !== 'SUPER_ADMIN') {
      mainAdmin.role = 'SUPER_ADMIN'
      await mainAdmin.save()
    }
  })
  .then(() => {
    const server = createServer(app)
    initInternalMessagingSocket(server, corsOrigin)
    server.listen(port, () => {
      logger.info({ port, version: APP_VERSION }, 'API listening')
      // Start CRM automation scheduler (legacy)
      startScheduler()
      // Start new automation engine
      initAutomationEngine()
      // Verrouillage automatique des écritures comptables VALIDATED expirées
      startAutoLockScheduler()
    })
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'MongoDB connection error')
    process.exit(1)
  })
