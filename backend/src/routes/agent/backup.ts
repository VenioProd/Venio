import express, { type Request, type Response, type NextFunction } from 'express'
import { createBackup, listBackups } from '../../lib/backup.js'
import { requireScope } from './_middleware/auth.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les backups MongoDB.
 *
 * Scopes :
 *   - read:backup     → liste des backups disponibles
 *   - manage:backup   → trigger un nouveau backup (mongodump)
 *
 * Restore : non exposé via API agent en V1 — c'est une opération
 * destructrice qui demande une intervention manuelle (l'admin doit
 * arrêter le service, valider la destination, etc.). Pour automatiser
 * un restore, utiliser un script CLI dédié.
 */

const router = express.Router()

router.get('/backup', requireScope('read:backup'), (_req: Request, res: Response) => {
  const items = listBackups()
  res.json({ items, total: items.length })
})

router.post(
  '/backup/trigger',
  requireScope('manage:backup'),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = createBackup()
      if (!result.success) {
        return respondError(
          res,
          500,
          'BACKUP_FAILED',
          result.error || 'Backup mongodump a échoué (vérifier que mongodump est installé)'
        )
      }
      res.locals.audit = {
        entityType: 'Backup',
        summary: `Backup MongoDB déclenché → ${result.path}`,
        after: { path: result.path },
      }
      res.status(201).json({ ok: true, path: result.path, createdAt: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  }
)

export default router
