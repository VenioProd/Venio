import express, { type Request, type Response, type NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import DevProject from '../../../models/DevProject.js'
import BetaCampaign, { BETA_CAMPAIGN_STATUSES } from '../../../models/BetaCampaign.js'
import BetaScenario from '../../../models/BetaScenario.js'
import BetaTester from '../../../models/BetaTester.js'
import BetaRun from '../../../models/BetaRun.js'
import { computeCoverage } from '../../../lib/beta/summary.js'
import { buildCampaignReportData, renderCampaignReportPdf } from '../../../lib/beta/report.js'
import { isObjectId, loadCampaign, parseDate, readString } from './shared.js'

const router = express.Router()

// GET /api/admin/beta/campaigns
router.get(
  '/campaigns',
  requirePermission(PERMISSIONS.VIEW_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: Record<string, unknown> = {}
      const { devProject, status } = req.query
      if (isObjectId(devProject)) filter.devProject = devProject
      if (typeof status === 'string' && (BETA_CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
        filter.status = status
      }

      const campaigns = await BetaCampaign.find(filter)
        .populate('devProject', 'key name color')
        .sort({ updatedAt: -1 })
        .limit(200)
        .lean()

      // Un compteur par campagne évite d'ouvrir chaque fiche pour savoir où
      // elles en sont.
      const ids = campaigns.map((campaign) => campaign._id)
      const [scenarioCounts, runCounts, testerCounts] = await Promise.all([
        BetaScenario.aggregate([
          { $match: { campaign: { $in: ids }, archivedAt: null } },
          { $group: { _id: '$campaign', total: { $sum: 1 } } },
        ]),
        BetaRun.aggregate([
          { $match: { campaign: { $in: ids }, verdict: { $ne: 'WORKS' }, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } } },
          { $group: { _id: '$campaign', total: { $sum: 1 } } },
        ]),
        BetaTester.aggregate([
          { $match: { campaign: { $in: ids }, revokedAt: null } },
          { $group: { _id: '$campaign', total: { $sum: 1 } } },
        ]),
      ])
      const byId = (rows: Array<{ _id: unknown; total: number }>) =>
        new Map(rows.map((row) => [String(row._id), row.total]))
      const scenarios = byId(scenarioCounts)
      const openIssues = byId(runCounts)
      const testers = byId(testerCounts)

      return res.json({
        campaigns: campaigns.map((campaign) => ({
          ...campaign,
          counts: {
            scenarios: scenarios.get(String(campaign._id)) ?? 0,
            openFindings: openIssues.get(String(campaign._id)) ?? 0,
            testers: testers.get(String(campaign._id)) ?? 0,
          },
        })),
      })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/admin/beta/campaigns
router.post(
  '/campaigns',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = readString(req.body?.name, 160)
      if (!name) return res.status(400).json({ error: 'Le nom de la campagne est obligatoire' })

      const { devProject } = req.body ?? {}
      if (!isObjectId(devProject)) return res.status(400).json({ error: 'Projet dev invalide' })
      const project = await DevProject.findById(devProject).select('_id')
      if (!project) return res.status(400).json({ error: 'Projet dev introuvable' })

      const campaign = await BetaCampaign.create({
        devProject,
        name,
        description: readString(req.body?.description, 5000),
        targetUrl: readString(req.body?.targetUrl, 500) || null,
        startsAt: parseDate(req.body?.startsAt),
        endsAt: parseDate(req.body?.endsAt),
        createdBy: req.user!.id,
      })

      return res.status(201).json({ campaign })
    } catch (err) {
      return next(err)
    }
  },
)

// GET /api/admin/beta/campaigns/:campaignId
router.get(
  '/campaigns/:campaignId',
  requirePermission(PERMISSIONS.VIEW_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = req.betaCampaign!
      const [scenarios, testers, runs] = await Promise.all([
        BetaScenario.find({ campaign: campaign._id, archivedAt: null }).sort({ rank: 1, number: 1 }).lean(),
        // `tokenHash` reste hors de la réponse : il n'a aucune utilité côté
        // client et ne doit pas circuler.
        BetaTester.find({ campaign: campaign._id }).select('-tokenHash').sort({ createdAt: 1 }).lean(),
        BetaRun.find({ campaign: campaign._id }).select('scenario tester verdict status severity').lean(),
      ])

      const coverage = computeCoverage({
        scenarioIds: scenarios.map((scenario) => String(scenario._id)),
        testerIds: testers.filter((tester) => !tester.revokedAt).map((tester) => String(tester._id)),
        runs: runs
          .filter((run) => run.tester)
          .map((run) => ({
            scenarioId: String(run.scenario),
            testerId: String(run.tester),
            verdict: run.verdict,
          })),
      })

      return res.json({ campaign, scenarios, testers, coverage })
    } catch (err) {
      return next(err)
    }
  },
)

// PATCH /api/admin/beta/campaigns/:campaignId
router.patch(
  '/campaigns/:campaignId',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = req.betaCampaign!
      const body = req.body ?? {}

      if (body.name !== undefined) {
        const name = readString(body.name, 160)
        if (!name) return res.status(400).json({ error: 'Le nom de la campagne est obligatoire' })
        campaign.name = name
      }
      if (body.description !== undefined) campaign.description = readString(body.description, 5000)
      if (body.targetUrl !== undefined) campaign.targetUrl = readString(body.targetUrl, 500) || null
      if (body.startsAt !== undefined) campaign.startsAt = parseDate(body.startsAt)
      if (body.endsAt !== undefined) campaign.endsAt = parseDate(body.endsAt)
      if (body.status !== undefined) {
        if (!(BETA_CAMPAIGN_STATUSES as readonly string[]).includes(body.status)) {
          return res.status(400).json({ error: 'Statut de campagne invalide' })
        }
        campaign.status = body.status
      }

      await campaign.save()
      return res.json({ campaign })
    } catch (err) {
      return next(err)
    }
  },
)

// GET /api/admin/beta/campaigns/:campaignId/report — rapport à archiver ou
// à remettre au client.
router.get(
  '/campaigns/:campaignId/report',
  requirePermission(PERMISSIONS.VIEW_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await buildCampaignReportData(String(req.betaCampaign!._id))
      const buffer = await renderCampaignReportPdf(data)

      const safeName = data.campaign.name.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçœæ\s-]/gi, '').replace(/\s+/g, '_')
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="Beta_${safeName}.pdf"`)
      return res.send(buffer)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
