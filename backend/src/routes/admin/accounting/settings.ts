import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import CompanySettings from '../../../models/CompanySettings.js'
import type { ICompanySettings } from '../../../types/models/index.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// Liste blanche des champs autorisés à la mutation
const ALLOWED_FIELDS = [
  'legalName',
  'legalForm',
  'siret',
  'siren',
  'apeNafCode',
  'rcs',
  'vatNumber',
  'capitalSocial',
  'address',
  'contactEmail',
  'contactPhone',
  'website',
  'logoPath',
  'fiscalRegime',
  'vatPeriodicity',
  'fiscalYearStartMonth',
  'currency',
  'ibanList',
  'paymentTermsDays',
  'legalMentions',
  'invoiceFooterNote',
  'latePaymentRateNote',
  'isConfigured',
] as const

// GET / : récupère le singleton (en le créant à la volée si absent)
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await CompanySettings.getOrCreate()
      res.json({ settings })
    } catch (err) {
      next(err)
    }
  }
)

// PATCH / : met à jour les champs autorisés du singleton
router.patch(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = (req.body || {}) as Record<string, unknown>
      const settings = await CompanySettings.getOrCreate()
      for (const key of ALLOWED_FIELDS) {
        if (body[key] !== undefined) {
          // Assignation dynamique : on triche un peu côté TS (objet typé via clés filtrées)
          ;(settings as unknown as Record<string, unknown>)[key] = body[key]
        }
      }
      await (settings as ICompanySettings).save()
      res.json({ settings })
    } catch (err) {
      next(err)
    }
  }
)

export default router
