/**
 * Router parent pour `/api/admin/interns`.
 *
 * Avant ce refactor, `routes/admin/interns.ts` faisait 1059 lignes.
 * Découpé en 3 sous-routers par domaine :
 *  - core.ts     : CRUD intern + KPIs/stats/dashboard + conventions (~690 lignes)
 *  - reports.ts  : rapports d'activité (CRUD + serving files)         (~280 lignes)
 *  - settings.ts : settings + reminders + reminder-logs               (~80 lignes)
 *
 * Issue #93 / chantier #8 de l'audit stabilisation 2026-05-26.
 */
import express from 'express'
import coreRouter from './core.js'
import reportsRouter from './reports.js'
import settingsRouter from './settings.js'

const router = express.Router()

router.use(coreRouter)
router.use(reportsRouter)
router.use(settingsRouter)

export default router
