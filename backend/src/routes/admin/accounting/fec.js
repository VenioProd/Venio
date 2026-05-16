import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import CompanySettings from '../../../models/CompanySettings.js'
import AccountingLine from '../../../models/AccountingLine.js'
import AuditLog from '../../../models/AuditLog.js'
import { exportFec } from '../../../lib/accounting/fecExporter.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

function parseDateParam(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

// ----------------------------------------------------------------------------
// GET /export?from=...&to=...&fiscalYear=...
// Télécharge le FEC sur la période.
// ----------------------------------------------------------------------------
router.get('/export', requirePermission(PERMISSIONS.EXPORT_FEC), async (req, res, next) => {
  try {
    const from = parseDateParam(req.query.from)
    const to = parseDateParam(req.query.to)
    if (!from || !to) {
      return res.status(400).json({ error: 'Paramètres from et to requis (dates ISO)' })
    }
    const fiscalYear = req.query.fiscalYear || null

    // Récupération du SIREN pour composer le nom du fichier.
    const settings = await CompanySettings.getOrCreate()
    const siren = (settings.siren || '').replace(/\D/g, '')

    // On compose un nom de fichier provisoire pour l'en-tête HTTP. La fonction
    // exportFec produit aussi le nom officiel qu'on réutilise.
    const ymd = `${to.getUTCFullYear()}${String(to.getUTCMonth() + 1).padStart(2, '0')}${String(to.getUTCDate()).padStart(2, '0')}`
    const provisionalName = siren ? `${siren}FEC${ymd}.txt` : `FEC-${ymd}.txt`

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${provisionalName}"`)

    // Audit AVANT le stream : un export FEC est un événement légal — on doit
    // savoir qui, quand, sur quelle période, même si la connexion est coupée
    // au milieu du download. Estimation du volume via une count rapide sur
    // les lignes (peut être imprécise si fiscalYear est fourni mais c'est un
    // ordre de grandeur).
    const lineFilter = { date: { $gte: from, $lte: to } }
    if (fiscalYear) lineFilter.fiscalYear = fiscalYear
    let lineCount = null
    try {
      lineCount = await AccountingLine.countDocuments(lineFilter)
    } catch {
      // Best effort — on ne bloque pas l'export pour un compteur.
    }
    AuditLog.record({
      action: 'FEC_EXPORT',
      entityType: 'FEC',
      entityRef: provisionalName,
      actor: buildActorFromReq(req),
      summary: `Export FEC ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`,
      metadata: {
        from,
        to,
        fiscalYear: fiscalYear || null,
        siren,
        filename: provisionalName,
        lineCountEstimate: lineCount,
      },
    })

    // On streame directement dans la réponse pour éviter d'accumuler tout
    // le contenu en mémoire — pratique pour les exports annuels.
    const result = await exportFec({
      from,
      to,
      fiscalYear,
      stream: res,
      siren,
    })
    // Si on était passé par le buffer, on aurait appelé res.send. Ici on a
    // streamé : on n'a plus qu'à fermer.
    if (!res.writableEnded) {
      res.end()
    }
    // Le filename calculé par exportFec est mis dans un header X-* informationnel.
    // Note : ce header est inutile une fois la réponse fermée mais on documente
    // le format dans la signature retournée.
    void result
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

export default router
