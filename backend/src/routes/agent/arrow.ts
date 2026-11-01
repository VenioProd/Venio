import express, { type Request, type Response, type NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import ArrowPilotage from '../../models/ArrowPilotage.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour le pilotage Arrow.
 *
 * Scopes : read:arrow / write:arrow.
 *
 * - /arrow/pilotage : singleton (goals, scorecard, decisions, cadence)
 */

const router = express.Router()

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

// ═════════════════════════════════════════════════════════════════════════
// Pilotage (singleton)
// ═════════════════════════════════════════════════════════════════════════

router.get('/arrow/pilotage', requireScope('read:arrow'), async (_req, res, next) => {
  try {
    const doc = (await ArrowPilotage.findOne({ key: 'arrow' }).lean()) || {
      key: 'arrow',
      goals: [],
      scorecard: [],
      decisions: [],
      cadence: [],
    }
    res.json(doc)
  } catch (err) {
    next(err)
  }
})

router.put(
  '/arrow/pilotage',
  requireScope('write:arrow'),
  body('goals').optional().isArray(),
  body('scorecard').optional().isArray(),
  body('decisions').optional().isArray(),
  body('cadence').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      const payload: Record<string, unknown> = { key: 'arrow', updatedBy: admin?._id }
      for (const f of ['goals', 'scorecard', 'decisions', 'cadence'] as const) {
        if (Array.isArray(req.body[f])) {
          payload[f] = req.body[f].map((s: unknown) => String(s))
        }
      }
      const doc = await ArrowPilotage.findOneAndUpdate(
        { key: 'arrow' },
        { $set: payload },
        {
          new: true,
          upsert: true,
        },
      )
      res.locals.audit = {
        entityType: 'ArrowPilotage',
        entityId: String(doc?._id),
        summary: 'Mise à jour du pilotage Arrow',
        after: doc?.toObject(),
      }
      res.json(doc?.toObject())
    } catch (err) {
      next(err)
    }
  },
)

export default router
