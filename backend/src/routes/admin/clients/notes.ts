import express, { Request, Response, NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientNote from '../../../models/ClientNote.js'
import { ok, error, ensureClient, logActivity } from './helpers.js'

const router = express.Router()

router.get('/:id/notes', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const notes = await ClientNote.find({ clientId: client._id })
      .sort({ pinned: -1, createdAt: -1 })
      .populate('createdBy', 'name email')
      .lean()

    return ok(res, { notes })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/notes', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const { content, pinned } = req.body || {}
    if (!content || !String(content).trim()) {
      return error(res, 422, 'content is required', 'VALIDATION_ERROR')
    }

    const note = await ClientNote.create({
      clientId: client._id,
      content: String(content).trim(),
      createdBy: req.user!.id,
      pinned: Boolean(pinned),
      visibility: 'INTERNE',
    })

    await logActivity({
      clientId: client._id,
      actorId: req.user!.id,
      type: 'NOTE_CREATED',
      label: 'Note interne ajoutée',
      payload: { noteId: note._id },
    })

    const populatedNote = await ClientNote.findById(note._id).populate('createdBy', 'name email').lean()
    return ok(res, { note: populatedNote }, null, 201)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id/notes/:noteId', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const note = await ClientNote.findOne({ _id: req.params.noteId, clientId: client._id })
    if (!note) {
      return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
    }

    if (req.body?.content !== undefined) {
      if (!String(req.body.content).trim()) {
        return error(res, 422, 'content cannot be empty', 'VALIDATION_ERROR')
      }
      note.content = String(req.body.content).trim()
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

    const populatedNote = await ClientNote.findById(note._id).populate('createdBy', 'name email').lean()
    return ok(res, { note: populatedNote })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id/notes/:noteId', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const note = await ClientNote.findOneAndDelete({ _id: req.params.noteId, clientId: client._id })
    if (!note) {
      return error(res, 404, 'Note not found', 'NOTE_NOT_FOUND')
    }

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
})

export default router
