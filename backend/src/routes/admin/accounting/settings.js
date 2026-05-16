import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import CompanySettings from '../../../models/CompanySettings.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (_req, res, next) => {
  try {
    const settings = await CompanySettings.getOrCreate()
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

router.patch('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const body = req.body || {}
    const settings = await CompanySettings.getOrCreate()

    const allowedFields = [
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
    ]
    for (const key of allowedFields) {
      if (body[key] !== undefined) settings[key] = body[key]
    }
    await settings.save()
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

export default router
