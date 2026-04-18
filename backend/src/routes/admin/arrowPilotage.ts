import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import ArrowPilotage from '../../models/ArrowPilotage.js'

const router = Router()

router.use(auth)
router.use(requireAdmin)

const DEFAULT_ARROW_PILOTAGE = {
  goals: [
    'Valider le cas d’usage prioritaire avec 5 retours utilisateurs',
    'Stabiliser le workflow MVP de bout en bout',
    'Transformer les apprentissages en décisions produit',
  ],
  scorecard: [
    'Workflow principal cadré',
    'Missions de validation créées',
    'Blocages visibles',
    'Premiers livrables suivis',
  ],
  decisions: [
    'Cette semaine | Premier workflow Arrow | Concentrer le suivi sur un scénario utilisateur principal avant d’élargir. | Produit',
    'À trancher | Critère MVP | Définir le seuil minimum pour considérer le prototype testable. | Équipe',
    'À revoir | Cible prioritaire | Réévaluer après les premiers tests et objections récurrentes. | Direction',
  ],
  cadence: [
    'Lundi | Priorités, responsables, livrable attendu.',
    'Mercredi | Blocages, arbitrages, ajustements.',
    'Vendredi | Résultats, apprentissages, décisions.',
    'Règle | Chaque semaine livre un résultat ou un apprentissage validé.',
  ],
}

const SECTIONS = ['goals', 'scorecard', 'decisions', 'cadence'] as const
type ArrowPilotageSection = typeof SECTIONS[number]

async function getOrCreatePilotage() {
  return ArrowPilotage.findOneAndUpdate(
    { key: 'arrow' },
    { $setOnInsert: { key: 'arrow', ...DEFAULT_ARROW_PILOTAGE } },
    { new: true, upsert: true }
  ).lean()
}

function sanitizeLines(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(line => typeof line === 'string' ? line.trim() : '')
    .filter(Boolean)
    .slice(0, 50)
}

// GET /api/admin/arrow-pilotage
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pilotage = await getOrCreatePilotage()
    res.json(pilotage)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// PATCH /api/admin/arrow-pilotage
router.patch('/', async (req: Request, res: Response) => {
  try {
    const section = req.body.section as ArrowPilotageSection
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ error: 'Section Arrow invalide' })
    }

    const values = sanitizeLines(req.body.values)
    await getOrCreatePilotage()
    const pilotage = await ArrowPilotage.findOneAndUpdate(
      { key: 'arrow' },
      {
        $set: {
          [section]: values,
          updatedBy: (req.user as { id?: string } | undefined)?.id,
        },
      },
      { new: true }
    ).lean()

    res.json(pilotage)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
