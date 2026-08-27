import express, { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { INTERACTION_BODY_MAX_LENGTH } from '../../../models/Interaction.js'
import { findClientNote, listClientNotes, logInteraction, toClientNoteShape } from '../../../lib/interactions.js'
import { ok, error, ensureClient, logActivity } from './helpers.js'
import { createNotification } from '../../../lib/notifications.js'

/**
 * Notes internes d'un compte client. Elles vivent depuis le chantier « journal
 * des échanges » dans Interaction(NOTE, CLIENT) ; ces routes conservent leur
 * contrat d'origine (`content`, `pinned`, `createdBy` peuplé) pour ne casser
 * aucun consommateur.
 */
const router = express.Router()

router.get(
  '/:id/notes',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

      return ok(res, { notes: await listClientNotes(client._id) })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/notes',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

      const { content, pinned } = req.body || {}
      if (!content || !String(content).trim()) {
        return error(res, 422, 'content is required', 'VALIDATION_ERROR')
      }
      if (String(content).length > INTERACTION_BODY_MAX_LENGTH) {
        return error(res, 422, `content exceeds ${INTERACTION_BODY_MAX_LENGTH} characters`, 'VALIDATION_ERROR')
      }

      const note = await logInteraction({
        subjectType: 'CLIENT',
        subjectId: client._id,
        kind: 'NOTE',
        body: String(content).trim(),
        pinned: Boolean(pinned),
        author: req.user!.id,
      })

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'NOTE_CREATED',
        label: 'Note interne ajoutée',
        payload: { noteId: note._id },
      })

      await note.populate('author', 'name email')
      const shaped = toClientNoteShape(note.toObject())

      // Notif au owner admin du client (si différent du créateur de la note)
      const ownerAdminId = (client as { ownerAdminId?: mongoose.Types.ObjectId | string | null }).ownerAdminId
      if (ownerAdminId && String(ownerAdminId) !== req.user!.id) {
        createNotification({
          recipient: ownerAdminId,
          type: 'CLIENT_NOTE_ADDED',
          title: `Note interne sur ${client.companyName || client.name}`,
          message: String(content).slice(0, 140),
          link: `/admin/clients/${client._id}`,
          metadata: { clientId: String(client._id), noteId: String(note._id) },
        }).catch(() => {})
      }

      return ok(res, { note: shaped }, null, 201)
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id/notes/:noteId',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

      if (!mongoose.isValidObjectId(req.params.noteId)) {
        return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
      }
      const note = await findClientNote(client._id, req.params.noteId as string)
      if (!note) {
        return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
      }

      if (req.body?.content !== undefined) {
        if (!String(req.body.content).trim()) {
          return error(res, 422, 'content cannot be empty', 'VALIDATION_ERROR')
        }
        if (String(req.body.content).length > INTERACTION_BODY_MAX_LENGTH) {
          return error(res, 422, `content exceeds ${INTERACTION_BODY_MAX_LENGTH} characters`, 'VALIDATION_ERROR')
        }
        note.body = String(req.body.content).trim()
      }

      if (req.body?.pinned !== undefined) {
        note.pinned = Boolean(req.body.pinned)
      }

      await note.save()

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'NOTE_UPDATED',
        label: 'Note interne modifiée',
        payload: { noteId: note._id },
      })

      await note.populate('author', 'name email')
      return ok(res, { note: toClientNoteShape(note.toObject()) })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:id/notes/:noteId',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

      if (!mongoose.isValidObjectId(req.params.noteId)) {
        return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
      }
      const note = await findClientNote(client._id, req.params.noteId as string)
      if (!note) {
        return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
      }
      await note.deleteOne()

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'NOTE_DELETED',
        label: 'Note interne supprimée',
        payload: { noteId: note._id },
      })

      return ok(res, { success: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
