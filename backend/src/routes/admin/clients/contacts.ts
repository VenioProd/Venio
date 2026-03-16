import express, { Request, Response, NextFunction } from 'express'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ClientContact from '../../../models/ClientContact.js'
import { ok, error, ensureClient, logActivity } from './helpers.js'

const router = express.Router()

router.get('/:id/contacts', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const contacts = await ClientContact.find({ clientId: client._id }).sort({ isMain: -1, updatedAt: -1 }).lean()
    return ok(res, { contacts })
  } catch (err) {
    return next(err)
  }
})

router.post('/:id/contacts', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const { firstName, lastName, email, phone, role, isMain, notes } = req.body || {}
    if (!firstName || !String(firstName).trim()) {
      return error(res, 422, 'firstName is required', 'VALIDATION_ERROR')
    }

    if (isMain === true) {
      await ClientContact.updateMany({ clientId: client._id, isMain: true }, { $set: { isMain: false } })
    }

    const contact = await ClientContact.create({
      clientId: client._id,
      firstName: String(firstName).trim(),
      lastName: typeof lastName === 'string' ? lastName.trim() : '',
      email: typeof email === 'string' ? email.toLowerCase().trim() : '',
      phone: typeof phone === 'string' ? phone.trim() : '',
      role: typeof role === 'string' ? role.trim() : '',
      isMain: Boolean(isMain),
      notes: typeof notes === 'string' ? notes.trim() : '',
    })

    await logActivity({
      clientId: client._id,
      actorId: req.user!.id,
      type: 'CONTACT_CREATED',
      label: 'Contact client ajouté',
      payload: { contactId: contact._id },
    })

    return ok(res, { contact }, null, 201)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:id/contacts/:contactId', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const contact = await ClientContact.findOne({ _id: req.params.contactId, clientId: client._id })
    if (!contact) {
      return error(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND')
    }

    const fields = ['firstName', 'lastName', 'phone', 'role', 'notes']
    for (const field of fields) {
      if (req.body?.[field] !== undefined) {
        (contact as any)[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : ''
      }
    }

    if (req.body?.email !== undefined) {
      contact.email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : ''
    }

    if (req.body?.isMain !== undefined) {
      const isMain = Boolean(req.body.isMain)
      if (isMain) {
        await ClientContact.updateMany({ clientId: client._id, _id: { $ne: contact._id }, isMain: true }, { $set: { isMain: false } })
      }
      contact.isMain = isMain
    }

    await contact.save()

    await logActivity({
      clientId: client._id,
      actorId: req.user!.id,
      type: 'CONTACT_UPDATED',
      label: 'Contact client modifié',
      payload: { contactId: contact._id },
    })

    return ok(res, { contact })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id/contacts/:contactId', requirePermission(PERMISSIONS.MANAGE_CLIENTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await ensureClient(req.params.id as string, req)
    if (!client) return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')

    const contact = await ClientContact.findOneAndDelete({ _id: req.params.contactId, clientId: client._id })
    if (!contact) {
      return error(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND')
    }

    await logActivity({
      clientId: client._id,
      actorId: req.user!.id,
      type: 'CONTACT_DELETED',
      label: 'Contact client supprimé',
      payload: { contactId: contact._id },
    })

    return ok(res, { success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
