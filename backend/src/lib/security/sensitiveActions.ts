import type { NextFunction, Request, Response } from 'express'
import User from '../../models/User.js'
import { buildActorFromReq, recordAudit } from '../audit/auditHelpers.js'
import { verifyTotp } from '../mfa.js'
import { notifySuperAdmins } from '../notifyHelpers.js'
import { requireRecentMfaStepUp } from '../../middleware/mfa.js'

export const SENSITIVE_ACTION_CONFIRMATION_HEADER = 'x-venio-confirm'

type SensitivityLevel = 'ELEVATED' | 'HIGH' | 'CRITICAL'
type StepUpRequirement = 'NONE' | 'SESSION' | 'TOTP_CODE'

interface SensitiveActionPolicy {
  level: SensitivityLevel
  confirmation: 'TYPED'
  stepUp: StepUpRequirement
  allowedRoles?: readonly string[]
  notifySuperAdmins?: boolean
  summary: string
}

/**
 * Source de vérité des actions à impact élevé.
 *
 * Toute nouvelle action sensible doit être ajoutée ici avant d'être montée
 * sur une route avec `sensitiveAction`. Les permissions métier restent
 * appliquées par les middlewares RBAC de chaque route : cette politique ne
 * les remplace ni ne les élargit.
 */
export type SensitiveActionId =
  | 'AGENT_TOKEN_CREATE'
  | 'AGENT_TOKEN_UPDATE'
  | 'AGENT_TOKEN_REVOKE'
  | 'TOOL_ACCESS_CREATE'
  | 'TOOL_ACCESS_UPDATE'
  | 'TOOL_SECRET_REVEAL'
  | 'TOOL_ACCESS_DELETE'
  | 'PROJECT_DELETE'
  | 'DEV_PROJECT_DELETE'
  | 'FEC_EXPORT'
  | 'ACCOUNTING_REPORT_EXPORT'
  | 'EDUCATION_ASSIGNMENT_EXPORT'
  | 'EDUCATION_SESSION_EXPORT'
  | 'EDUCATION_CLASS_EXPORT'
  | 'ACCOUNTING_ENTRY_DELETE'
  | 'EXTERNAL_SOURCE_CREATE'
  | 'EXTERNAL_SOURCE_ROTATE'
  | 'EXTERNAL_SOURCE_DELETE'

export const SENSITIVE_ACTIONS: Record<SensitiveActionId, SensitiveActionPolicy> = {
  AGENT_TOKEN_CREATE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN'],
    summary: 'Création d’un token d’agent',
  },
  AGENT_TOKEN_UPDATE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN'],
    summary: 'Modification des droits d’un token d’agent',
  },
  AGENT_TOKEN_REVOKE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN'],
    summary: 'Révocation d’un token d’agent',
  },
  TOOL_ACCESS_CREATE: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
    notifySuperAdmins: true,
    summary: 'Création d’un accès outil',
  },
  TOOL_ACCESS_UPDATE: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
    notifySuperAdmins: true,
    summary: 'Modification ou rotation d’un accès outil',
  },
  TOOL_SECRET_REVEAL: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'TOTP_CODE',
    allowedRoles: ['SUPER_ADMIN'],
    notifySuperAdmins: true,
    summary: 'Révélation d’un secret outil',
  },
  TOOL_ACCESS_DELETE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    allowedRoles: ['SUPER_ADMIN'],
    notifySuperAdmins: true,
    summary: 'Suppression d’un accès outil',
  },
  PROJECT_DELETE: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Suppression définitive d’un projet client',
  },
  DEV_PROJECT_DELETE: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Suppression définitive d’un projet de développement',
  },
  FEC_EXPORT: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    notifySuperAdmins: true,
    summary: 'Export du fichier des écritures comptables',
  },
  ACCOUNTING_REPORT_EXPORT: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Export CSV d’un rapport comptable',
  },
  EDUCATION_ASSIGNMENT_EXPORT: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Export CSV des corrections pédagogiques',
  },
  EDUCATION_SESSION_EXPORT: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Export CSV des présences pédagogiques',
  },
  EDUCATION_CLASS_EXPORT: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Export CSV ou JSON d’une classe pédagogique',
  },
  ACCOUNTING_ENTRY_DELETE: {
    level: 'HIGH',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    summary: 'Suppression d’une écriture comptable brouillon',
  },
  EXTERNAL_SOURCE_CREATE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    notifySuperAdmins: true,
    summary: 'Création d’une source externe et révélation de ses secrets',
  },
  EXTERNAL_SOURCE_ROTATE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    notifySuperAdmins: true,
    summary: 'Rotation des secrets d’une source externe',
  },
  EXTERNAL_SOURCE_DELETE: {
    level: 'CRITICAL',
    confirmation: 'TYPED',
    stepUp: 'SESSION',
    notifySuperAdmins: true,
    summary: 'Suppression d’une source externe',
  },
}

async function satisfiesStepUp(policy: SensitiveActionPolicy, req: Request, res: Response): Promise<boolean> {
  if (policy.stepUp === 'NONE') return true
  if (policy.stepUp === 'SESSION') return requireRecentMfaStepUp(req, res)

  const code = req.body?.totpCode
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    res.status(403).json({ error: 'MFA_STEP_UP_REQUIRED', message: 'Un code MFA récent est requis.' })
    return false
  }
  const user = await User.findById(req.user!.id).select('email twoFactorEnabled twoFactorSecret').lean()
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    res.status(403).json({ error: 'MFA_SETUP_REQUIRED', message: 'Configurez la MFA avant cette action sensible.' })
    return false
  }
  if (!verifyTotp(user.twoFactorSecret, user.email, code)) {
    res.status(403).json({ error: 'MFA_STEP_UP_INVALID', message: 'Code MFA invalide.' })
    return false
  }
  return true
}

/**
 * Garde-fou réutilisable : confirmation typée, step-up, audit append-only et
 * alerte post-succès. L'audit est déclenché uniquement sur une réponse 2xx,
 * après l'action métier, et ne journalise jamais le corps de la requête.
 */
export function sensitiveAction(action: SensitiveActionId) {
  const policy = SENSITIVE_ACTIONS[action]
  return async function sensitiveActionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.user || (policy.allowedRoles && !policy.allowedRoles.includes(req.user.role))) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const confirmation = req.header(SENSITIVE_ACTION_CONFIRMATION_HEADER)
    if (!confirmation) {
      res.status(428).json({
        error: 'SENSITIVE_ACTION_CONFIRMATION_REQUIRED',
        action,
        confirmationHeader: 'X-Venio-Confirm',
      })
      return
    }
    if (confirmation !== action) {
      res.status(403).json({ error: 'SENSITIVE_ACTION_CONFIRMATION_INVALID', action })
      return
    }
    if (!(await satisfiesStepUp(policy, req, res))) return

    res.once('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return
      const actor = buildActorFromReq(req)
      void recordAudit({
        action: 'SENSITIVE_ACTION_EXECUTED',
        actor,
        summary: policy.summary,
        extra: {
          sensitiveAction: action,
          sensitivityLevel: policy.level,
          confirmation: policy.confirmation,
          stepUp: policy.stepUp,
          method: req.method,
          path: req.originalUrl.split('?')[0] || req.path,
        },
      })
      if (policy.notifySuperAdmins) {
        void notifySuperAdmins({
          type: 'SENSITIVE_ACTION_EXECUTED',
          title: 'Action sensible exécutée',
          message: policy.summary,
          link: '/admin/audit',
          metadata: { sensitiveAction: action, sensitivityLevel: policy.level },
          excludeUserId: req.user!.id,
        })
      }
    })
    next()
  }
}

/**
 * Applique un garde-fou uniquement quand un prédicat de requête est satisfait.
 * Les routes de rapport restent ainsi consultables en JSON avec leur RBAC
 * existant, tandis que leur variante téléchargeable est tracée comme export.
 */
export function sensitiveActionWhen(action: SensitiveActionId, predicate: (req: Request) => boolean) {
  const middleware = sensitiveAction(action)
  return function conditionalSensitiveAction(req: Request, res: Response, next: NextFunction): void {
    if (!predicate(req)) {
      next()
      return
    }
    void middleware(req, res, next)
  }
}
