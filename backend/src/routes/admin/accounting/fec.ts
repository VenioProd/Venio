import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import CompanySettings from '../../../models/CompanySettings.js'
import AccountingLine from '../../../models/AccountingLine.js'
import { exportFec } from '../../../lib/accounting/fecExporter.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

function parseDateParam(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return d
}

// ----------------------------------------------------------------------------
// GET /export?from=...&to=...&fiscalYear=...
// Télécharge le FEC sur la période.
// ----------------------------------------------------------------------------
router.get(
  '/export',
  requirePermission(PERMISSIONS.EXPORT_FEC),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const from = parseDateParam(req.query.from)
      const to = parseDateParam(req.query.to)
      if (!from || !to) {
        res.status(400).json({ error: 'Paramètres from et to requis (dates ISO)' })
        return
      }
      const fiscalYear = (req.query.fiscalYear as string | undefined) || null

      // Récupération du SIREN pour composer le nom du fichier.
      const settings = await CompanySettings.getOrCreate()
      const siren = (settings.siren || '').replace(/\D/g, '')

      // Nom de fichier provisoire pour l'en-tête HTTP. exportFec produit aussi
      // le nom officiel mais on n'a pas le luxe de le connaître avant de
      // commencer à streamer.
      const ymd = `${to.getUTCFullYear()}${String(to.getUTCMonth() + 1).padStart(2, '0')}${String(
        to.getUTCDate()
      ).padStart(2, '0')}`
      const provisionalName = siren ? `${siren}FEC${ymd}.txt` : `FEC-${ymd}.txt`

      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${provisionalName}"`)

      // Comptage best-effort pour la métadonnée d'audit (Phase D — audit
      // applicatif désactivé en attente du portage du module audit).
      const lineFilter: Record<string, unknown> = { date: { $gte: from, $lte: to } }
      if (fiscalYear) lineFilter.fiscalYear = fiscalYear
      try {
        await AccountingLine.countDocuments(lineFilter)
      } catch {
        // Best effort — on ne bloque pas l'export pour un compteur.
      }

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
      // result.filename calculé par exportFec correspond au nom officiel.
      void result
    } catch (err) {
      const status = (err as { status?: number } | null | undefined)?.status
      if (status) {
        res.status(status).json({ error: (err as Error).message })
        return
      }
      next(err)
    }
  }
)

export default router
