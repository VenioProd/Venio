import express, { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { body, validationResult } from 'express-validator'
import { requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS, ADMIN_ROLES } from '../../../lib/permissions.js'
import { sendAdminCredentials } from '../../../lib/email.js'
import { triggerAutomations } from '../../../automation/trigger.js'
import User from '../../../models/User.js'
import { createClientFolders, getClientCloudInfo } from '../../../lib/nextcloud.js'
import { ok, error, parsePagination, normalizeClientPayload, ensureClient, logActivity } from './helpers.js'
import { createNotification } from '../../../lib/notifications.js'
import { notifySuperAdmins } from '../../../lib/notifyHelpers.js'
import { revokeUserSessions } from '../../../lib/session.js'
import logger from '../../../lib/logger.js'

const router = express.Router()

router.get(
  '/',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, status, owner, health, sort = 'updatedAt_desc' } = req.query as Record<string, string | undefined>
      const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>)

      const filter: Record<string, unknown> = { role: 'CLIENT' }

      // Scope to own clients for non-SUPER_ADMIN
      if (req.user!.role !== 'SUPER_ADMIN') {
        filter.ownerAdminId = req.user!.id
      }

      if (q) {
        const regex = new RegExp(
          String(q)
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        )
        filter.$or = [{ name: regex }, { companyName: regex }, { email: regex }]
      }

      if (status) filter.status = status
      if (health) filter.healthStatus = health

      if (owner === 'unassigned') {
        filter.ownerAdminId = null
      } else if (owner && mongoose.isValidObjectId(owner)) {
        filter.ownerAdminId = owner
      }

      const sortMap: Record<string, Record<string, 1 | -1>> = {
        updatedAt_desc: { updatedAt: -1 },
        updatedAt_asc: { updatedAt: 1 },
        createdAt_desc: { createdAt: -1 },
        createdAt_asc: { createdAt: 1 },
        name_asc: { name: 1 },
        status_asc: { status: 1, updatedAt: -1 },
        health_asc: { healthStatus: 1, updatedAt: -1 },
      }

      const [clients, total] = await Promise.all([
        User.find(filter)
          .select('-passwordHash')
          .populate('ownerAdminId', 'name email role')
          .sort(sortMap[sort as string] || sortMap.updatedAt_desc)
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ])

      return ok(
        res,
        { clients },
        {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1),
        },
      )
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  body('companyName').trim().notEmpty().withMessage("Le nom de l'entreprise est requis"),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe: minimum 6 caractères'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { email, password, name } = req.body || {}

      const normalizedEmail = String(email).toLowerCase().trim()
      const existing = await User.findOne({ email: normalizedEmail })
      if (existing) {
        return error(res, 409, 'Email already exists', 'EMAIL_ALREADY_EXISTS')
      }

      const payload = normalizeClientPayload(req.body)

      // Auto-assign to self for non-SUPER_ADMIN
      if (req.user!.role !== 'SUPER_ADMIN' && !payload.ownerAdminId) {
        payload.ownerAdminId = req.user!.id
      }

      if (payload.ownerAdminId && !mongoose.isValidObjectId(payload.ownerAdminId)) {
        return error(res, 422, 'Invalid ownerAdminId', 'INVALID_OWNER')
      }

      if (payload.ownerAdminId) {
        const ownerUser = await User.findOne({ _id: payload.ownerAdminId, role: { $in: ADMIN_ROLES } })
        if (!ownerUser) {
          return error(res, 422, 'ownerAdminId must reference an admin account', 'INVALID_OWNER')
        }
      }

      const passwordHash = await bcrypt.hash(password, 10)

      const client = await User.create({
        email: normalizedEmail,
        passwordHash,
        role: 'CLIENT',
        name: String(name).trim(),
        ...payload,
      })

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'CLIENT_CREATED',
        label: 'Compte client créé',
        payload: { email: normalizedEmail },
      })

      // Create Nextcloud folders for the client (fire-and-forget)
      createClientFolders(client.companyName || client.name, client._id.toString()).catch((err: Error) => {
        logger.error({ data: err.message || err }, '[Nextcloud] Error creating client folders:')
      })

      // Trigger client onboarding sequence
      triggerAutomations(['onboarding.client_welcome_sequence'], {
        clientId: client._id.toString(),
        actorId: req.user!.id,
      })

      const fullClient = await User.findById(client._id)
        .select('-passwordHash')
        .populate('ownerAdminId', 'name email role')
        .lean()

      // Notif super admins (sauf créateur) + owner admin assigné
      notifySuperAdmins({
        type: 'CLIENT_CREATED',
        title: `Nouveau client`,
        message: `${client.companyName || client.name} créé`,
        link: `/admin/clients/${client._id}`,
        metadata: { clientId: String(client._id) },
        excludeUserId: req.user!.id,
      }).catch(() => {})
      if (payload.ownerAdminId && String(payload.ownerAdminId) !== req.user!.id) {
        createNotification({
          recipient: payload.ownerAdminId,
          type: 'CLIENT_CREATED',
          title: `Client assigné à vous`,
          message: `${client.companyName || client.name}`,
          link: `/admin/clients/${client._id}`,
          metadata: { clientId: String(client._id) },
        }).catch(() => {})
      }

      return ok(res, { client: fullClient }, null, 201)
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) {
        return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')
      }

      const fullClient = await User.findById(client._id)
        .select('-passwordHash')
        .populate('ownerAdminId', 'name email role')
        .lean()
      return ok(res, { client: fullClient })
    } catch (err) {
      return next(err)
    }
  },
)

// Get Nextcloud cloud folder info for a client
router.get(
  '/:id/cloud',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = await ensureClient(req.params.id as string, req)
      if (!client) {
        return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')
      }

      const cloudInfo = getClientCloudInfo(client.companyName || client.name, client._id.toString())
      return ok(res, { cloud: cloudInfo })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  body('email').optional().isEmail().withMessage('Email invalide').normalizeEmail(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const client = await ensureClient(req.params.id as string, req)
      if (!client) {
        return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')
      }

      const payload: Record<string, any> = normalizeClientPayload(req.body || {})

      if (req.body?.email !== undefined) {
        const nextEmail = String(req.body.email || '')
          .toLowerCase()
          .trim()
        if (!nextEmail) {
          return error(res, 422, 'email cannot be empty', 'VALIDATION_ERROR')
        }
        const duplicate = await User.findOne({ email: nextEmail, _id: { $ne: client._id } })
        if (duplicate) {
          return error(res, 409, 'Email already exists', 'EMAIL_ALREADY_EXISTS')
        }
        payload.email = nextEmail
      }

      if (payload.ownerAdminId !== undefined) {
        if (req.user!.role !== 'SUPER_ADMIN') {
          return error(res, 403, 'Only SUPER_ADMIN can reassign owner', 'FORBIDDEN_OWNER_REASSIGN')
        }

        if (payload.ownerAdminId && !mongoose.isValidObjectId(payload.ownerAdminId)) {
          return error(res, 422, 'Invalid ownerAdminId', 'INVALID_OWNER')
        }

        if (payload.ownerAdminId) {
          const ownerUser = await User.findOne({ _id: payload.ownerAdminId, role: { $in: ADMIN_ROLES } })
          if (!ownerUser) {
            return error(res, 422, 'ownerAdminId must reference an admin account', 'INVALID_OWNER')
          }
        }
      }

      // Un mot de passe réécrit par l'admin doit invalider les sessions ouvertes,
      // comme le font /api/auth/change-password et /api/auth/reset-password.
      const passwordChanged = Boolean(req.body?.password)
      if (passwordChanged) {
        payload.passwordHash = await bcrypt.hash(String(req.body.password), 10)
        payload.passwordChangedAt = new Date()
        payload.sessionVersion = (client.sessionVersion ?? 0) + 1
      }

      const updated = await User.findByIdAndUpdate(client._id, payload, { new: true })
        .select('-passwordHash')
        .populate('ownerAdminId', 'name email role')
        .lean()

      if (passwordChanged) {
        await revokeUserSessions(client._id.toString())
      }

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'CLIENT_UPDATED',
        label: 'Compte client modifié',
        payload: { fields: Object.keys(payload) },
      })

      return ok(res, { client: updated })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/archive',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') {
        return error(res, 403, 'Only SUPER_ADMIN can archive a client', 'FORBIDDEN_ARCHIVE')
      }

      const client = await ensureClient(req.params.id as string, req)
      if (!client) {
        return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')
      }

      client.status = 'ARCHIVE'
      client.archivedAt = new Date()
      await client.save()

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'CLIENT_ARCHIVED',
        label: 'Compte client archivé',
      })

      const safeClient = await User.findById(client._id)
        .select('-passwordHash')
        .populate('ownerAdminId', 'name email role')
        .lean()
      return ok(res, { client: safeClient })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/reactivate',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') {
        return error(res, 403, 'Only SUPER_ADMIN can reactivate a client', 'FORBIDDEN_REACTIVATE')
      }

      const client = await ensureClient(req.params.id as string, req)
      if (!client) {
        return error(res, 404, 'Client not found', 'CLIENT_NOT_FOUND')
      }

      client.status = 'ACTIF'
      client.archivedAt = null
      await client.save()

      await logActivity({
        clientId: client._id,
        actorId: req.user!.id,
        type: 'CLIENT_REACTIVATED',
        label: 'Compte client réactivé',
      })

      const safeClient = await User.findById(client._id)
        .select('-passwordHash')
        .populate('ownerAdminId', 'name email role')
        .lean()
      return ok(res, { client: safeClient })
    } catch (err) {
      return next(err)
    }
  },
)

// Reset password and/or send credentials by email
router.post(
  '/:id/send-credentials',
  requirePermission(PERMISSIONS.MANAGE_CLIENTS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { password } = req.body || {}
      if (!password) {
        return res.status(400).json({ error: 'Le mot de passe est requis.' })
      }
      const client = await User.findById(req.params.id)
      if (!client || client.role !== 'CLIENT') {
        return res.status(404).json({ error: 'Client not found' })
      }
      const result = await sendAdminCredentials({
        to: client.email,
        name: client.name,
        email: client.email,
        password,
      })
      if (!result.sent) {
        return res.status(500).json({ error: result.error || "Erreur lors de l'envoi." })
      }
      return res.json({ success: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
