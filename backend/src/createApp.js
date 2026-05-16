import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

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
import adminAccountingRoutes from './routes/admin/accounting/index.js'
import clientProjectContentRoutes from './routes/client/projectContent.js'
import externalRoutes from './routes/external.js'

/**
 * Construit l'instance Express. NE PAS appeler app.listen ici — c'est la
 * responsabilité de index.js (en prod) ou directement de supertest (en test).
 *
 * Permet aux tests d'utiliser supertest(createApp()) sans bind sur un port.
 */
export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5001',
      credentials: true,
    })
  )

  // Logger HTTP : on désactive en environnement de test pour ne pas polluer
  // la sortie Jest.
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'))
  }

  // Routes externes : montées AVANT express.json() car la vérification HMAC
  // nécessite le raw body en bytes (le router gère son propre body parsing).
  app.use('/api/external', externalRoutes)

  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/auth', authRoutes)
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
  app.use('/api/admin/accounting', adminAccountingRoutes)

  // Routes client pour le contenu des projets
  app.use('/api/projects', clientProjectContentRoutes)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || 500
    res.status(status).json({
      error: err.message || 'Server error',
    })
  })

  return app
}

export default createApp
