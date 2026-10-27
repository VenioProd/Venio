import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import User from '../../models/User.js'
import { DEFAULT_APP_THEME, isAppTheme } from '../../lib/appTheme.js'
import { APP_LOCALES } from '../../lib/pushText.js'

// Préférences de l'app native, partagées entre les appareils de l'utilisateur.
const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.id).select('appTheme appLocale').lean()
    const { theme, background, accent } = user?.appTheme ?? DEFAULT_APP_THEME
    return res.json({ theme, background, accent, locale: user?.appLocale ?? 'system' })
  } catch (err) {
    return next(err)
  }
})

router.put(
  '/',
  body().custom(isAppTheme).withMessage('Thème, fond ou accent invalide'),
  body('locale').isIn(APP_LOCALES).withMessage('Langue invalide'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        const invalidLocale = errors.array().some((error) => error.type === 'field' && error.path === 'locale')
        return res
          .status(400)
          .json({ error: errors.array()[0]!.msg, code: invalidLocale ? 'INVALID_LOCALE' : 'INVALID_THEME' })
      }
      const { theme, background, accent, locale } = req.body
      await User.updateOne(
        { _id: req.user!.id },
        { $set: { appTheme: { theme, background, accent }, appLocale: locale } },
      )
      return res.json({ theme, background, accent, locale })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
