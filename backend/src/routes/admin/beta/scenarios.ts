import express, { type Request, type Response, type NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import BetaScenario from '../../../models/BetaScenario.js'
import BetaTemplate from '../../../models/BetaTemplate.js'
import { createScenarioWithRetry, normalizeSteps } from '../../../lib/beta/scenarios.js'
import { isObjectId, loadCampaign, readString } from './shared.js'

const router = express.Router()

// POST /api/admin/beta/campaigns/:campaignId/scenarios
router.post(
  '/campaigns/:campaignId/scenarios',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const title = readString(req.body?.title, 200)
      if (!title) return res.status(400).json({ error: 'L’intitulé de la démarche est obligatoire' })

      const scenario = await createScenarioWithRetry({
        campaign: req.betaCampaign!._id,
        title,
        description: readString(req.body?.description, 10000),
        steps: req.body?.steps,
      })

      return res.status(201).json({ scenario })
    } catch (err) {
      return next(err)
    }
  },
)

// PATCH /api/admin/beta/scenarios/:scenarioId
router.patch(
  '/scenarios/:scenarioId',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scenarioId } = req.params
      if (!isObjectId(scenarioId)) return res.status(400).json({ error: 'Identifiant invalide' })
      const scenario = await BetaScenario.findById(scenarioId)
      if (!scenario) return res.status(404).json({ error: 'Démarche introuvable' })

      const body = req.body ?? {}
      if (body.title !== undefined) {
        const title = readString(body.title, 200)
        if (!title) return res.status(400).json({ error: 'L’intitulé de la démarche est obligatoire' })
        scenario.title = title
      }
      if (body.description !== undefined) scenario.description = readString(body.description, 10000)
      if (body.steps !== undefined) scenario.steps = normalizeSteps(body.steps)
      if (typeof body.rank === 'number' && Number.isFinite(body.rank)) scenario.rank = body.rank

      await scenario.save()
      return res.json({ scenario })
    } catch (err) {
      return next(err)
    }
  },
)

// DELETE /api/admin/beta/scenarios/:scenarioId — archive, ne supprime pas :
// les verdicts déjà rendus restent une trace de ce qui a été testé.
router.delete(
  '/scenarios/:scenarioId',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scenarioId } = req.params
      if (!isObjectId(scenarioId)) return res.status(400).json({ error: 'Identifiant invalide' })
      const scenario = await BetaScenario.findByIdAndUpdate(
        scenarioId,
        { $set: { archivedAt: new Date() } },
        { new: true },
      )
      if (!scenario) return res.status(404).json({ error: 'Démarche introuvable' })
      return res.json({ scenario })
    } catch (err) {
      return next(err)
    }
  },
)

// ─── Trames réutilisables ───

// GET /api/admin/beta/templates
router.get(
  '/templates',
  requirePermission(PERMISSIONS.VIEW_BETA),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json({ templates: await BetaTemplate.find().sort({ name: 1 }).lean() })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/admin/beta/templates — enregistre une trame, éventuellement
// capturée depuis une campagne existante.
router.post(
  '/templates',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = readString(req.body?.name, 160)
      if (!name) return res.status(400).json({ error: 'Le nom de la trame est obligatoire' })

      let scenarios = Array.isArray(req.body?.scenarios) ? req.body.scenarios : []
      if (isObjectId(req.body?.fromCampaign)) {
        const source = await BetaScenario.find({ campaign: req.body.fromCampaign, archivedAt: null })
          .sort({ rank: 1, number: 1 })
          .lean()
        scenarios = source.map((scenario) => ({
          title: scenario.title,
          description: scenario.description,
          steps: scenario.steps,
        }))
      }

      const normalized = scenarios
        .map((scenario: Record<string, unknown>) => ({
          title: readString(scenario?.title, 200),
          description: readString(scenario?.description, 10000),
          steps: normalizeSteps(scenario?.steps),
        }))
        .filter((scenario: { title: string }) => scenario.title.length > 0)
        .slice(0, 100)

      if (normalized.length === 0) {
        return res.status(400).json({ error: 'Une trame doit contenir au moins une démarche' })
      }

      const existing = await BetaTemplate.findOne({ name }).select('_id').lean()
      if (existing) return res.status(409).json({ error: 'Une trame porte déjà ce nom' })

      const template = await BetaTemplate.create({
        name,
        description: readString(req.body?.description, 2000),
        scenarios: normalized,
        createdBy: req.user!.id,
      })
      return res.status(201).json({ template })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/admin/beta/campaigns/:campaignId/apply-template
router.post(
  '/campaigns/:campaignId/apply-template',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isObjectId(req.body?.template)) return res.status(400).json({ error: 'Trame invalide' })
      const template = await BetaTemplate.findById(req.body.template).lean()
      if (!template) return res.status(404).json({ error: 'Trame introuvable' })

      // Séquentiel volontairement : l'allocation des numéros s'appuie sur un
      // compteur, et le parallélisme n'apporterait ici que des collisions.
      const created = []
      for (const scenario of template.scenarios) {
        created.push(
          await createScenarioWithRetry({
            campaign: req.betaCampaign!._id,
            title: scenario.title,
            description: scenario.description,
            steps: scenario.steps,
          }),
        )
      }

      return res.status(201).json({ scenarios: created })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
