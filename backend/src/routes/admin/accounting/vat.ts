import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import VatDeclaration from '../../../models/VatDeclaration.js'
import CompanySettings from '../../../models/CompanySettings.js'
import { computeVatForPeriod } from '../../../lib/accounting/vatComputation.js'
import type { VatDeclarationType } from '../../../types/enums.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// Helpers --------------------------------------------------------------------

function parseDateParam(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function handleBusinessError(res: Response, next: NextFunction, err: unknown): void {
  const status = (err as { status?: number } | null | undefined)?.status
  if (status) {
    res.status(status).json({ error: (err as Error).message })
    return
  }
  next(err)
}

// ----------------------------------------------------------------------------
// GET /compute?from=...&to=...&fiscalYear=...&previousCredit=...
// Pré-calcul d'une déclaration TVA sans archivage.
// ----------------------------------------------------------------------------
router.get(
  '/compute',
  requirePermission(PERMISSIONS.VIEW_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const periodStart = parseDateParam(req.query.from)
      const periodEnd = parseDateParam(req.query.to)
      if (!periodStart || !periodEnd) {
        res.status(400).json({ error: 'Paramètres from et to requis (dates ISO)' })
        return
      }
      const fiscalYear = (req.query.fiscalYear as string | undefined) || null
      const previousCredit = Number(req.query.previousCredit || 0) || 0
      const result = await computeVatForPeriod({
        periodStart,
        periodEnd,
        fiscalYear,
        previousCredit,
      })
      res.json({ vat: result })
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /declarations?status=...&type=...&page=...&limit=...
// ----------------------------------------------------------------------------
router.get(
  '/declarations',
  requirePermission(PERMISSIONS.VIEW_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, type, page = '1', limit = '50' } = req.query as Record<
        string,
        string | undefined
      >
      const filter: Record<string, unknown> = {}
      if (status) filter.status = String(status).toUpperCase()
      if (type) filter.type = String(type).toUpperCase()
      const skip = (Number(page) - 1) * Number(limit)
      const [declarations, total] = await Promise.all([
        VatDeclaration.find(filter)
          .sort({ periodStart: -1, createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        VatDeclaration.countDocuments(filter),
      ])
      res.json({ declarations, total, page: Number(page), limit: Number(limit) })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// POST /declarations  body { type, periodStart, periodEnd, previousCredit?, notes? }
// Crée une nouvelle déclaration DRAFT à partir du calcul TVA.
// ----------------------------------------------------------------------------
interface CreateDeclarationBody {
  type?: string
  periodStart?: string
  periodEnd?: string
  previousCredit?: number | string
  notes?: string
  fiscalYear?: string | null
}

router.post(
  '/declarations',
  requirePermission(PERMISSIONS.MANAGE_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = (req.body || {}) as CreateDeclarationBody
      const { type, periodStart, periodEnd, previousCredit = 0, notes = '', fiscalYear } = body
      if (!type || !['CA3', 'CA12'].includes(String(type).toUpperCase())) {
        res.status(400).json({ error: 'type doit être CA3 ou CA12' })
        return
      }
      const start = parseDateParam(periodStart)
      const end = parseDateParam(periodEnd)
      if (!start || !end) {
        res.status(400).json({ error: 'periodStart et periodEnd requis (dates ISO)' })
        return
      }
      const settings = await CompanySettings.getOrCreate()
      const computed = await computeVatForPeriod({
        periodStart: start,
        periodEnd: end,
        fiscalYear: fiscalYear || null,
        previousCredit: Number(previousCredit) || 0,
      })

      const declaration = await VatDeclaration.create({
        type: String(type).toUpperCase() as VatDeclarationType,
        regime: settings.fiscalRegime || 'REEL_NORMAL',
        periodicity: settings.vatPeriodicity || 'MENSUEL',
        periodStart: start,
        periodEnd: end,
        fiscalYear: fiscalYear || null,
        collectedByRate: computed.collectedByRate,
        deductibleByRate: computed.deductibleByRate,
        totalCollected: computed.totalCollected,
        totalDeductible: computed.totalDeductible,
        totalDue: computed.totalDue,
        previousCredit: Number(previousCredit) || 0,
        currentCredit: computed.totalDue < 0 ? Math.abs(computed.totalDue) : 0,
        declarationLines: computed.declarationLines,
        status: 'DRAFT',
        notes,
        createdBy: req.user!.id,
      })

      res.status(201).json({ declaration })
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /declarations/:id
// ----------------------------------------------------------------------------
router.get(
  '/declarations/:id',
  requirePermission(PERMISSIONS.VIEW_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decl = await VatDeclaration.findById(req.params.id).lean()
      if (!decl) {
        res.status(404).json({ error: 'Déclaration introuvable' })
        return
      }
      res.json({ declaration: decl })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// PATCH /declarations/:id  body { notes?, previousCredit?, recompute? }
// ----------------------------------------------------------------------------
interface UpdateDeclarationBody {
  notes?: string
  previousCredit?: number | string
  recompute?: boolean
}

router.patch(
  '/declarations/:id',
  requirePermission(PERMISSIONS.MANAGE_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decl = await VatDeclaration.findById(req.params.id)
      if (!decl) {
        res.status(404).json({ error: 'Déclaration introuvable' })
        return
      }
      if (decl.status === 'SUBMITTED') {
        res.status(423).json({ error: 'Déclaration déjà transmise, modification impossible' })
        return
      }
      const body = (req.body || {}) as UpdateDeclarationBody
      const { notes, previousCredit, recompute } = body
      if (notes !== undefined) decl.notes = notes
      if (previousCredit !== undefined) decl.previousCredit = Number(previousCredit) || 0

      if (recompute) {
        const computed = await computeVatForPeriod({
          periodStart: decl.periodStart,
          periodEnd: decl.periodEnd,
          fiscalYear: decl.fiscalYear || null,
          previousCredit: decl.previousCredit || 0,
        })
        decl.collectedByRate = computed.collectedByRate
        decl.deductibleByRate = computed.deductibleByRate
        decl.totalCollected = computed.totalCollected
        decl.totalDeductible = computed.totalDeductible
        decl.totalDue = computed.totalDue
        decl.currentCredit = computed.totalDue < 0 ? Math.abs(computed.totalDue) : 0
        decl.declarationLines = computed.declarationLines
      }
      await decl.save()
      res.json({ declaration: decl })
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  }
)

// ----------------------------------------------------------------------------
// POST /declarations/:id/submit  body { submittedRef? }
// ----------------------------------------------------------------------------
interface SubmitDeclarationBody {
  submittedRef?: string
}

router.post(
  '/declarations/:id/submit',
  requirePermission(PERMISSIONS.MANAGE_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decl = await VatDeclaration.findById(req.params.id)
      if (!decl) {
        res.status(404).json({ error: 'Déclaration introuvable' })
        return
      }
      if (decl.status === 'SUBMITTED') {
        res.status(400).json({ error: 'Déclaration déjà transmise' })
        return
      }
      const { submittedRef = '' } = (req.body || {}) as SubmitDeclarationBody
      decl.status = 'SUBMITTED'
      decl.submittedAt = new Date()
      // Cast nécessaire car JwtPayload.id est typé string mais Mongoose accepte la coercion.
      decl.submittedBy = req.user!.id as unknown as typeof decl.submittedBy
      decl.submittedRef = submittedRef
      await decl.save()

      res.json({ declaration: decl })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// DELETE /declarations/:id
// ----------------------------------------------------------------------------
router.delete(
  '/declarations/:id',
  requirePermission(PERMISSIONS.MANAGE_VAT),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decl = await VatDeclaration.findById(req.params.id)
      if (!decl) {
        res.status(404).json({ error: 'Déclaration introuvable' })
        return
      }
      if (decl.status !== 'DRAFT') {
        res.status(400).json({ error: 'Seules les déclarations DRAFT peuvent être supprimées' })
        return
      }
      await decl.deleteOne()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  }
)

export default router
