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
import { existsSync, readFileSync } from 'fs'
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
import adminQuoteProposalRoutes from './routes/admin/quoteProposals.js'
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
import publicContactRoutes from './routes/public/contact.js'
import publicAnalyticsRoutes from './routes/public/analytics.js'
import adminTicketRoutes from './routes/admin/tickets.js'
import adminChangeRequestRoutes from './routes/admin/changeRequests.js'
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
import { requestIdMiddleware } from './routes/agent/_middleware/errors.js'
import { agentJsonBodyParser } from './routes/agent/_middleware/jsonBody.js'
import adminMessagingRoutes from './routes/admin/messaging.js'
import adminHealthRoutes from './routes/admin/health.js'
import adminActivityCenterRoutes from './routes/admin/activityCenter.js'
import adminWorkspaceRoutes from './routes/admin/workspace.js'
import clientProjectContentRoutes from './routes/client/projectContent.js'
import clientProjectPhaseRoutes from './routes/client/projectPhases.js'
import clientMessageRoutes from './routes/client/messages.js'
import clientCollaborationRoutes from './routes/client/collaboration.js'
import clientQuoteRoutes from './routes/client/quotes.js'
import clientChangeRequestRoutes from './routes/client/changeRequests.js'
import clientVaultRoutes from './routes/client/vault.js'
import clientFileRoutes from './routes/client/files.js'
import { initInternalMessagingSocket } from './realtime/internalMessagingSocket.js'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import { startScheduler } from './lib/crmScheduler.js'
import { initAutomationEngine } from './automation/index.js'
import { startAutoLockScheduler } from './lib/accounting/autoLock.js'
import { startRepoQualityScheduler } from './lib/dev/repoQualityScheduler.js'
import { initSentry, Sentry } from './lib/sentry.js'
import auth from './middleware/auth.js'
import requireMfa from './middleware/mfa.js'
import apiNotFound from './middleware/apiNotFound.js'
import { jsonBodyErrorHandler } from './middleware/jsonBodyErrors.js'

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
// scriptSrc : pas de 'unsafe-inline' — l'app n'a aucun <script> inline. Le fond
// animé est désormais rendu en CSS, donc aucun CDN JavaScript n'est chargé. Si
// Sentry est activé, son origine est ajoutée à connectSrc.
const sentryIngest = process.env.SENTRY_DSN ? new URL(process.env.SENTRY_DSN).origin : null
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", ...(sentryIngest ? [sentryIngest] : [])],
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

// Compression : Brotli lorsque le navigateur l'accepte, gzip sinon. Le seuil
// évite de compresser les très petites réponses, pour lesquelles le coût CPU
// serait supérieur au gain réseau.
app.use(
  compression({
    threshold: 1024,
    brotli: {},
  }),
)

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

// API agent : limite body plus haute (8 MiB) pour permettre l'upload de
// documents en base64 (jusqu'à ~5 MiB bruts ≈ 6,7 MiB encodés). Le wrapper
// conserve le format d'erreur agent pour les JSON invalides et les payloads
// trop volumineux. Il doit être monté avant le parser global (2 MiB).
app.use('/api/v1/agent', requestIdMiddleware, agentJsonBodyParser, agentRoutes)

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
        return (
          url === '/api/health' ||
          url.startsWith('/api/avatars/') ||
          url.startsWith('/api/assets/') ||
          url.startsWith('/assets/') ||
          url.startsWith('/api/public/analytics/')
        )
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

app.use('/api/admin/users', auth, requireMfa, adminUserRoutes)
app.use('/api/admin/clients', adminClientRoutes)
app.use('/api/admin/admins', auth, requireMfa, adminAdminsRoutes)
// Un seul mount pour /api/admin/projects — voir routes/admin/projects/index.ts
app.use('/api/admin/projects', adminProjectsRouter)
app.use('/api/admin/billing', adminBillingRoutes)
app.use('/api/admin/quote-proposals', adminQuoteProposalRoutes)
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
app.use('/api/admin/backups', auth, requireMfa, adminBackupRoutes)
app.use('/api/admin/qualiopi', adminQualiopiRoutes)
app.use('/api/admin/qualiopi-questionnaires', adminQualiopiQuestRoutes)
app.use('/api/questionnaire', publicQuestionnaireRoutes)
app.use('/api/contact', publicContactRoutes)
app.use('/api/public/analytics', publicAnalyticsRoutes)
app.use('/api/admin/tickets', adminTicketRoutes)
app.use('/api/admin/change-requests', adminChangeRequestRoutes)
app.use('/api/admin/gestion', adminGestionRoutes)
app.use('/api/admin/briefs', adminBriefRoutes)
app.use('/api/admin/tool-access', auth, requireMfa, adminToolAccessRoutes)
app.use('/api/admin/automations', adminAutomationRoutes)
app.use('/api/admin/interns', adminInternRoutes)
app.use('/api/admin/email-composer', adminEmailComposerRoutes)
app.use('/api/admin/internal-projects', adminInternalProjectRoutes)
app.use('/api/admin/arrow-pilotage', adminArrowPilotageRoutes)
app.use('/api/admin/arrow-prospection', adminArrowProspectionRoutes)
app.use('/api/admin/subsidiaries', adminSubsidiaryRoutes)
app.use('/api/admin/resources', adminResourceRoutes)
app.use('/api/admin/accounting', auth, requireMfa, adminAccountingRoutes)
app.use('/api/admin/messaging', adminMessagingRoutes)
app.use('/api/admin/health', adminHealthRoutes)
app.use('/api/admin/activity-center', adminActivityCenterRoutes)

// Gestion des tokens d'API agent (admin JWT) — UI : /admin/agents.
// NB : l'API agent elle-même (/api/v1/agent) est montée plus haut, AVANT le
// express.json global, pour autoriser un body plus volumineux (upload base64).
app.use('/api/admin/agent-tokens', auth, requireMfa, adminAgentTokenRoutes)

// Dev workspace (suivi développement type Linear, séparé de Projets clients).
app.use('/api/admin/dev', adminDevRoutes)
app.use('/api/admin/education', adminEducationRoutes)

// Routes client pour le contenu des projets
app.use('/api/projects', clientProjectContentRoutes)
app.use('/api/projects', clientProjectPhaseRoutes)
app.use('/api/projects', clientMessageRoutes)
app.use('/api/projects', clientCollaborationRoutes)
// Signature de devis : 10 tentatives /15 min /IP, aligné sur l'acceptation d'invitation.
app.use(
  '/api/projects/:projectId/proposals/:id/sign',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de signature. Réessayez plus tard.' },
  }),
)
app.use('/api/projects', clientQuoteRoutes)
// Ressource scopée compte (et non projet) : préfixe dédié /api/client.
app.use('/api/client/change-requests', clientChangeRequestRoutes)

app.use('/api/client', clientVaultRoutes)
app.use('/api/client', clientFileRoutes)

// This must stay after every /api mount and before static files / the SPA
// fallback. app.all covers the namespace root, unknown GET, mutations and
// non-standard API methods.
app.all(['/api', '/api/{*path}'], apiNotFound)

// Serve frontend static files in production
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, '..', 'public')
const hashedAssetPattern = /-[a-zA-Z0-9_-]{8,}\.(?:css|js|mjs|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|ico)$/

app.use(
  express.static(publicDir, {
    redirect: false,
    setHeaders: (res, filePath) => {
      const fileName = path.basename(filePath)

      // Vite fingerprints build assets. Ils ne changent jamais à contenu égal :
      // on peut donc les conserver un an sans risquer de servir une version
      // périmée après un déploiement.
      if (hashedAssetPattern.test(fileName)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        return
      }

      // index.html et le manifest doivent être relus à chaque navigation pour
      // pointer sans délai vers le nouveau bundle après un déploiement.
      if (fileName === 'index.html' || fileName === 'manifest.json') {
        res.setHeader('Cache-Control', 'no-cache')
        return
      }

      // Les fichiers stables sans hash (icônes, robots.txt…) restent cachables
      // une journée, sans bloquer durablement leurs mises à jour.
      res.setHeader('Cache-Control', 'public, max-age=86400')
    },
  }),
)

app.get('{*path}', (req: Request, res: Response) => {
  const prerenderedRelativePath = path.join(req.path.slice(1), 'index.html')
  const prerenderedIndex = path.join(publicDir, prerenderedRelativePath)

  // Route-specific public pages are emitted as nested index.html files during
  // the frontend build. Express does not resolve them when the canonical URL
  // has no trailing slash, so the SPA fallback checks for that file first.
  if (req.path !== '/' && existsSync(prerenderedIndex)) {
    res.sendFile(prerenderedRelativePath, { root: publicDir })
    return
  }

  res.sendFile('index.html', { root: publicDir })
})

// Sentry error handler — doit être AVANT le notre, capture les erreurs avant qu'on les
// transforme en réponse JSON. No-op si Sentry désactivé (DSN absent).
Sentry.setupExpressErrorHandler(app)

// Erreurs du parser JSON général : contrat stable pour les clients humains et
// administratifs. Les erreurs agent/external gardent leurs handlers dédiés.
app.use(jsonBodyErrorHandler)

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
      // Snapshots repo/cockpit : jamais de scan lourd depuis une route HTTP.
      startRepoQualityScheduler()
    })
  })
  .catch((err: unknown) => {
    logger.error({ err }, 'MongoDB connection error')
    process.exit(1)
  })
