import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import User from '../../models/User.js'
import { DEFAULT_APP_THEME, isAppTheme } from '../../lib/appTheme.js'

const router = Router()
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.id).select('appTheme').lean()
    return res.json(user?.appTheme || DEFAULT_APP_THEME)
  } catch (err) { return next(err) }
})
router.put('/', body().custom(isAppTheme).withMessage('Thème, fond ou accent invalide'), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Thème, fond ou accent invalide', code: 'INVALID_THEME' })
    const { theme, background, accent } = req.body
    const appTheme = { theme, background, accent }
    await User.updateOne({ _id: req.user!.id }, { $set: { appTheme } })
    return res.json(appTheme)
  } catch (err) { return next(err) }
})
export default router
