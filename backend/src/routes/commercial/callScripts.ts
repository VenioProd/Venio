import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { body, validationResult } from 'express-validator'
import CallScript, { CALL_SCRIPT_BODY_MAX, CALL_SCRIPT_TITLE_MAX } from '../../models/CallScript.js'
import CrmSettings from '../../models/CrmSettings.js'
import type { CallDeskScope } from '../../lib/callDeskScope.js'
import { callError } from '../../lib/callImports.js'

const readOnly: RequestHandler = (_req, res) => {
  res.status(403).json({ error: 'Les scripts sont modifiés par l’équipe' })
}

/**
 * Textes des scripts d'appel. Les étiquettes sont une liste unique de
 * `CrmSettings` (celle du poste d'appel, ajoutée par l'équipe comme par un
 * externe) ; le texte suit la même liste : tout lecteur du poste d'appel lit
 * tous les textes, et seule l'équipe avec `MANAGE_CRM` les écrit. Un externe
 * lit, il ne modifie pas.
 */
export function createCallScriptRoutes(scope: CallDeskScope) {
  const router = express.Router()

  router.get('/calls/scripts', scope.read, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await CrmSettings.getSettings()
      const rows = await CallScript.find({ tag: { $in: settings.callScriptTags } })
        .select('tag title body updatedAt')
        .lean()
      const byTag = new Map(rows.map((row) => [row.tag, row]))
      res.json({
        scripts: settings.callScriptTags.map((tag) => {
          const row = byTag.get(tag)
          return {
            tag,
            title: row?.title ?? null,
            body: row?.body ?? null,
            updatedAt: row?.updatedAt ?? null,
          }
        }),
      })
    } catch (err) {
      next(err)
    }
  })

  router.put(
    '/calls/scripts',
    scope.kind === 'team' ? scope.write : readOnly,
    body('tag').isString(),
    body('title').isString().trim().isLength({ min: 1, max: CALL_SCRIPT_TITLE_MAX }),
    body('body').isString(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const text = String(req.body.body ?? '')
          .replace(/\r\n?/g, '\n')
          .trim()
        if (!validationResult(req).isEmpty() || !text || text.length > CALL_SCRIPT_BODY_MAX)
          throw callError(400, 'Titre et texte requis (120 et 5 000 caractères au plus)')
        const tag = String(req.body.tag)
        const settings = await CrmSettings.getSettings()
        if (!settings.callScriptTags.includes(tag)) throw callError(404, 'Script inconnu')
        const script = await CallScript.findOneAndUpdate(
          { tag },
          { $set: { title: String(req.body.title).trim(), body: text, updatedBy: req.user!.id } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        )
        res.json({ script: { tag, title: script.title, body: script.body, updatedAt: script.updatedAt } })
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
