import express, { type NextFunction, type Request, type Response } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import { userHasPermission } from '../../middleware/role.js'
import User from '../../models/User.js'
import Intern from '../../models/Intern.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { sendAdminCredentials } from '../../lib/email.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import { createNotification } from '../../lib/notifications.js'
import { triggerAutomations } from '../../automation/trigger.js'
import logger from '../../lib/logger.js'

/**
 * Point d'entrée unique pour ajouter un utilisateur, quel que soit son statut.
 * Monté derrière `auth` + `requireMfa` (voir index.ts).
 *
 * Les stagiaires et alternants reçoivent, comme avec `POST /admin/interns`, un
 * compte `ADMIN` marqué d'un tag et une fiche `Intern` : les écrans existants
 * (liste, tableau de bord, rapports) s'appuient sur ce schéma.
 */
const router = express.Router()

export const MEMBER_KINDS = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'RH',
  'COMMERCIAL',
  'COMPTABLE',
  'VIEWER',
  'COMMERCIAL_EXTERNE',
  'STAGIAIRE',
  'ALTERNANT',
  'CLIENT',
] as const
export type MemberKind = (typeof MEMBER_KINDS)[number]

const INTERN_KINDS: MemberKind[] = ['STAGIAIRE', 'ALTERNANT']
const WEEK_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

router.post(
  '/',
  body('kind')
    .isIn([...MEMBER_KINDS])
    .withMessage('Statut invalide'),
  body('name').trim().notEmpty().withMessage('Le nom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = req.user
      if (!actor) return res.status(401).json({ error: 'Unauthorized' })

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const kind = req.body.kind as MemberKind
      const isIntern = INTERN_KINDS.includes(kind)

      // Droits : créer un client relève du CRM, tout le reste de la gestion des admins.
      const required = kind === 'CLIENT' ? PERMISSIONS.MANAGE_CLIENTS : PERMISSIONS.MANAGE_ADMINS
      if (actor.role !== 'SUPER_ADMIN' && !(await userHasPermission(req, required))) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      // Les comptes les plus sensibles restent réservés au super admin.
      if ((kind === 'SUPER_ADMIN' || isIntern) && actor.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (kind === 'SUPER_ADMIN' && (await User.countDocuments({ role: 'SUPER_ADMIN' })) > 0) {
        return res.status(409).json({ error: 'Super admin already exists' })
      }

      const email = String(req.body.email).toLowerCase().trim()
      const name = str(req.body.name)

      // Détails stagiaire/alternant : validés avant toute écriture.
      const internInput = (req.body.intern ?? {}) as Record<string, unknown>
      let dateDebut: Date | null = null
      let dateFin: Date | null = null
      if (isIntern) {
        if (!str(internInput.poste) || !str(internInput.dateDebut) || !str(internInput.dateFin)) {
          return res.status(400).json({ error: 'Champs requis : poste, date de début, date de fin' })
        }
        dateDebut = new Date(str(internInput.dateDebut))
        dateFin = new Date(str(internInput.dateFin))
        if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime())) {
          return res.status(400).json({ error: 'Dates invalides' })
        }
        if (dateFin < dateDebut) {
          return res.status(400).json({ error: 'La date de fin précède la date de début' })
        }
      }

      if (await User.findOne({ email })) {
        return res.status(409).json({ error: 'Email already exists' })
      }

      // Pas de mot de passe saisi à la main : un secret temporaire est généré et envoyé par email.
      const tempPassword = crypto.randomBytes(9).toString('base64url')
      const user = await User.create({
        email,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        role: isIntern ? 'ADMIN' : kind,
        name,
        phone: str(req.body.phone),
        jobTitle: str(req.body.jobTitle),
        tags: isIntern ? [kind] : [],
      })

      let internDoc = null
      if (isIntern && dateDebut && dateFin) {
        const days = Array.isArray(internInput.joursPresence)
          ? (internInput.joursPresence as unknown[]).filter(
              (d): d is string => typeof d === 'string' && WEEK_DAYS.includes(d),
            )
          : undefined
        try {
          internDoc = await Intern.create({
            userId: user._id,
            type: kind,
            poste: str(internInput.poste),
            departement: str(internInput.departement),
            dateDebut,
            dateFin,
            tuteur: str(internInput.tuteur) || null,
            ecole: str(internInput.ecole),
            formation: str(internInput.formation),
            notes: str(internInput.notes),
            ...(days && days.length ? { joursPresence: days } : {}),
            createdBy: actor.id,
          })
        } catch (err) {
          // Pas de compte orphelin si la fiche échoue.
          await User.findByIdAndDelete(user._id).catch(() => {})
          throw err
        }
      }

      let credentialsSent = false
      if (req.body.sendInvitation !== false) {
        const result = await sendAdminCredentials({ to: email, name, email, password: tempPassword })
        credentialsSent = Boolean(result.sent)
        if (!result.sent) logger.warn(`[members] Envoi des identifiants échoué pour ${email}: ${result.error ?? ''}`)
      }

      if (kind !== 'CLIENT') {
        triggerAutomations(['onboarding.internal_user_setup'], { userId: user._id.toString(), actorId: actor.id })
      }
      notifySuperAdmins({
        type: isIntern ? 'INTERN_CREATED' : 'ADMIN_CREATED',
        title: 'Nouveau membre',
        message: `${name} (${email}) — statut : ${kind}`,
        link: isIntern ? '/admin/stagiaires' : '/admin/team',
        metadata: { userId: String(user._id), kind },
        excludeUserId: actor.id,
      }).catch(() => {})
      const tutorId = internDoc?.tuteur ? String(internDoc.tuteur) : ''
      if (tutorId) {
        createNotification({
          recipient: tutorId,
          type: 'INTERN_CREATED',
          title: `Vous êtes tuteur de ${name}`,
          message: `${name} vous a été assigné`,
          link: '/admin/stagiaires',
          metadata: { internId: String(internDoc!._id) },
        }).catch(() => {})
      }

      const safeUser = await User.findById(user._id).select('-passwordHash')
      return res.status(201).json({ user: safeUser, intern: internDoc, credentialsSent })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
