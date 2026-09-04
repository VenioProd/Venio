import express, { type Request, type Response, type NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import BetaTester from '../../../models/BetaTester.js'
import { createBetaTesterToken, hashBetaTesterToken } from '../../../lib/beta/tokens.js'
import User from '../../../models/User.js'
import { isObjectId, isPlausibleEmail, loadCampaign, readString } from './shared.js'

const router = express.Router()

const DUPLICATE_KEY = 11000

/**
 * Le lien expire avec la campagne quand elle a une date de fin, et un mois
 * après l'invitation sinon : un lien oublié ne doit pas rester valable
 * indéfiniment.
 */
const DEFAULT_TESTER_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * POST /api/admin/beta/campaigns/:campaignId/testers/me
 *
 * Un membre de l'équipe se déclare testeur sur la campagne. Il n'a rien à
 * saisir : son nom et son adresse viennent de son compte, et le lien produit
 * est le même que celui d'un externe — c'est la surface testeur qui a été
 * pensée pour dérouler une campagne, pas l'écran d'administration.
 *
 * Ouvert à `view_beta` : participer à une recette n'est pas la piloter, et
 * exiger `manage_beta` interdirait à un lecteur de rendre le moindre verdict.
 */
router.post(
  '/campaigns/:campaignId/testers/me',
  requirePermission(PERMISSIONS.VIEW_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = req.betaCampaign!
      const me = await User.findById(req.user!.id).select('name email').lean()
      if (!me) return res.status(404).json({ error: 'Compte introuvable' })

      const already = await BetaTester.findOne({ campaign: campaign._id, user: req.user!.id }).select('_id').lean()
      if (already) {
        // Le secret n'est pas relisible : on ne peut pas le redonner, seulement
        // en produire un nouveau — ce que fait `rotate`, à la demande.
        return res.status(409).json({
          error: 'Vous participez déjà à cette campagne',
          tester: already._id,
        })
      }

      const token = createBetaTesterToken()
      const tester = await BetaTester.create({
        campaign: campaign._id,
        user: req.user!.id,
        name: me.name,
        email: me.email,
        tokenHash: hashBetaTesterToken(token),
        expiresAt: campaign.endsAt ?? new Date(Date.now() + DEFAULT_TESTER_TTL_MS),
      })

      const { tokenHash: _hidden, ...safe } = tester.toObject()
      return res.status(201).json({ tester: safe, token })
    } catch (err) {
      if ((err as { code?: number } | null)?.code === DUPLICATE_KEY) {
        return res.status(409).json({ error: 'Vous participez déjà à cette campagne' })
      }
      return next(err)
    }
  },
)

// POST /api/admin/beta/campaigns/:campaignId/testers
router.post(
  '/campaigns/:campaignId/testers',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  loadCampaign,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = req.betaCampaign!
      const name = readString(req.body?.name, 120)
      if (!name) return res.status(400).json({ error: 'Le nom du testeur est obligatoire' })
      if (!isPlausibleEmail(req.body?.email)) return res.status(400).json({ error: 'Adresse e-mail invalide' })

      const token = createBetaTesterToken()
      const tester = await BetaTester.create({
        campaign: campaign._id,
        name,
        email: String(req.body.email).trim(),
        tokenHash: hashBetaTesterToken(token),
        expiresAt: campaign.endsAt ?? new Date(Date.now() + DEFAULT_TESTER_TTL_MS),
      })

      // Le secret n'est lisible qu'ici. Passé cette réponse, seul un
      // renouvellement peut en produire un nouveau.
      const { tokenHash: _hidden, ...safe } = tester.toObject()
      return res.status(201).json({ tester: safe, token })
    } catch (err) {
      if ((err as { code?: number } | null)?.code === DUPLICATE_KEY) {
        return res.status(409).json({ error: 'Ce testeur est déjà invité sur cette campagne' })
      }
      return next(err)
    }
  },
)

// POST /api/admin/beta/testers/:testerId/revoke
router.post(
  '/testers/:testerId/revoke',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { testerId } = req.params
      if (!isObjectId(testerId)) return res.status(400).json({ error: 'Identifiant invalide' })
      // On révoque le lien, on ne supprime pas le testeur : ses verdicts
      // restent la mémoire de ce qui a été testé.
      const tester = await BetaTester.findByIdAndUpdate(
        testerId,
        { $set: { revokedAt: new Date() } },
        { new: true },
      ).select('-tokenHash')
      if (!tester) return res.status(404).json({ error: 'Testeur introuvable' })
      return res.json({ tester })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/admin/beta/testers/:testerId/rotate — pour un lien égaré.
router.post(
  '/testers/:testerId/rotate',
  requirePermission(PERMISSIONS.MANAGE_BETA),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { testerId } = req.params
      if (!isObjectId(testerId)) return res.status(400).json({ error: 'Identifiant invalide' })
      const tester = await BetaTester.findById(testerId)
      if (!tester) return res.status(404).json({ error: 'Testeur introuvable' })

      const token = createBetaTesterToken()
      tester.tokenHash = hashBetaTesterToken(token)
      tester.revokedAt = null
      await tester.save()

      const { tokenHash: _hidden, ...safe } = tester.toObject()
      return res.json({ tester: safe, token })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
