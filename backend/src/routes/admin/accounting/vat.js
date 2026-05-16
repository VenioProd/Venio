import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import VatDeclaration from '../../../models/VatDeclaration.js'
import CompanySettings from '../../../models/CompanySettings.js'
import AuditLog from '../../../models/AuditLog.js'
import { computeVatForPeriod } from '../../../lib/accounting/vatComputation.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// Helpers --------------------------------------------------------------------

function parseDateParam(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function sendBusinessError(res, err) {
  if (err && err.status) {
    return res.status(err.status).json({ error: err.message })
  }
  throw err
}

// ----------------------------------------------------------------------------
// GET /compute?from=...&to=...&fiscalYear=...&previousCredit=...
// Pré-calcul d'une déclaration TVA sans archivage.
// ----------------------------------------------------------------------------
router.get('/compute', requirePermission(PERMISSIONS.VIEW_VAT), async (req, res, next) => {
  try {
    const periodStart = parseDateParam(req.query.from)
    const periodEnd = parseDateParam(req.query.to)
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Paramètres from et to requis (dates ISO)' })
    }
    const fiscalYear = req.query.fiscalYear || null
    const previousCredit = Number(req.query.previousCredit || 0) || 0
    const result = await computeVatForPeriod({
      periodStart,
      periodEnd,
      fiscalYear,
      previousCredit,
    })
    res.json({ vat: result })
  } catch (err) {
    try {
      sendBusinessError(res, err)
    } catch (rethrown) {
      next(rethrown)
    }
  }
})

// ----------------------------------------------------------------------------
// GET /declarations?status=...&type=...&page=...&limit=...
// ----------------------------------------------------------------------------
router.get('/declarations', requirePermission(PERMISSIONS.VIEW_VAT), async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query
    const filter = {}
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
})

// ----------------------------------------------------------------------------
// POST /declarations  body { type, periodStart, periodEnd, previousCredit?, notes? }
// Crée une nouvelle déclaration DRAFT à partir du calcul TVA.
// ----------------------------------------------------------------------------
router.post('/declarations', requirePermission(PERMISSIONS.MANAGE_VAT), async (req, res, next) => {
  try {
    const { type, periodStart, periodEnd, previousCredit = 0, notes = '', fiscalYear } =
      req.body || {}
    if (!type || !['CA3', 'CA12'].includes(String(type).toUpperCase())) {
      return res.status(400).json({ error: 'type doit être CA3 ou CA12' })
    }
    const start = parseDateParam(periodStart)
    const end = parseDateParam(periodEnd)
    if (!start || !end) {
      return res.status(400).json({ error: 'periodStart et periodEnd requis (dates ISO)' })
    }
    const settings = await CompanySettings.getOrCreate()
    const computed = await computeVatForPeriod({
      periodStart: start,
      periodEnd: end,
      fiscalYear: fiscalYear || null,
      previousCredit: Number(previousCredit) || 0,
    })

    const declaration = await VatDeclaration.create({
      type: String(type).toUpperCase(),
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
      createdBy: req.user.id,
    })

    AuditLog.record({
      action: 'VAT_DECLARATION_CREATE',
      entityType: 'VatDeclaration',
      entityId: declaration._id,
      entityRef: `${declaration.type} ${start.toISOString().slice(0, 10)}→${end.toISOString().slice(0, 10)}`,
      actor: buildActorFromReq(req),
      summary: `Création déclaration ${declaration.type} (${declaration.periodicity})`,
      after: {
        type: declaration.type,
        periodStart: declaration.periodStart,
        periodEnd: declaration.periodEnd,
        totalCollected: declaration.totalCollected,
        totalDeductible: declaration.totalDeductible,
        totalDue: declaration.totalDue,
      },
    })

    res.status(201).json({ declaration })
  } catch (err) {
    try {
      sendBusinessError(res, err)
    } catch (rethrown) {
      next(rethrown)
    }
  }
})

// ----------------------------------------------------------------------------
// GET /declarations/:id
// ----------------------------------------------------------------------------
router.get('/declarations/:id', requirePermission(PERMISSIONS.VIEW_VAT), async (req, res, next) => {
  try {
    const decl = await VatDeclaration.findById(req.params.id).lean()
    if (!decl) return res.status(404).json({ error: 'Déclaration introuvable' })
    res.json({ declaration: decl })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// PATCH /declarations/:id  body { notes?, previousCredit?, recompute? }
// ----------------------------------------------------------------------------
router.patch('/declarations/:id', requirePermission(PERMISSIONS.MANAGE_VAT), async (req, res, next) => {
  try {
    const decl = await VatDeclaration.findById(req.params.id)
    if (!decl) return res.status(404).json({ error: 'Déclaration introuvable' })
    if (decl.status === 'SUBMITTED') {
      return res.status(423).json({ error: 'Déclaration déjà transmise, modification impossible' })
    }
    const { notes, previousCredit, recompute } = req.body || {}
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
    try {
      sendBusinessError(res, err)
    } catch (rethrown) {
      next(rethrown)
    }
  }
})

// ----------------------------------------------------------------------------
// POST /declarations/:id/submit  body { submittedRef? }
// ----------------------------------------------------------------------------
router.post('/declarations/:id/submit', requirePermission(PERMISSIONS.MANAGE_VAT), async (req, res, next) => {
  try {
    const decl = await VatDeclaration.findById(req.params.id)
    if (!decl) return res.status(404).json({ error: 'Déclaration introuvable' })
    if (decl.status === 'SUBMITTED') {
      return res.status(400).json({ error: 'Déclaration déjà transmise' })
    }
    const { submittedRef = '' } = req.body || {}
    decl.status = 'SUBMITTED'
    decl.submittedAt = new Date()
    decl.submittedBy = req.user.id
    decl.submittedRef = submittedRef
    await decl.save()

    AuditLog.record({
      action: 'VAT_DECLARATION_SUBMIT',
      entityType: 'VatDeclaration',
      entityId: decl._id,
      entityRef: `${decl.type} ${new Date(decl.periodStart).toISOString().slice(0, 10)}→${new Date(decl.periodEnd).toISOString().slice(0, 10)}`,
      actor: buildActorFromReq(req),
      summary: `Soumission ${decl.type} (ref ${submittedRef || 'n/a'})`,
      after: {
        status: decl.status,
        submittedAt: decl.submittedAt,
        submittedRef: decl.submittedRef,
      },
      metadata: {
        totalCollected: decl.totalCollected,
        totalDeductible: decl.totalDeductible,
        totalDue: decl.totalDue,
      },
    })

    res.json({ declaration: decl })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// DELETE /declarations/:id
// ----------------------------------------------------------------------------
router.delete('/declarations/:id', requirePermission(PERMISSIONS.MANAGE_VAT), async (req, res, next) => {
  try {
    const decl = await VatDeclaration.findById(req.params.id)
    if (!decl) return res.status(404).json({ error: 'Déclaration introuvable' })
    if (decl.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Seules les déclarations DRAFT peuvent être supprimées' })
    }
    const snapshot = {
      type: decl.type,
      periodStart: decl.periodStart,
      periodEnd: decl.periodEnd,
      totalCollected: decl.totalCollected,
      totalDeductible: decl.totalDeductible,
      totalDue: decl.totalDue,
    }
    await decl.deleteOne()
    AuditLog.record({
      action: 'VAT_DECLARATION_DELETE',
      entityType: 'VatDeclaration',
      entityId: decl._id,
      entityRef: `${decl.type} ${new Date(decl.periodStart).toISOString().slice(0, 10)}→${new Date(decl.periodEnd).toISOString().slice(0, 10)}`,
      actor: buildActorFromReq(req),
      summary: `Suppression brouillon ${decl.type}`,
      before: snapshot,
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

export default router
