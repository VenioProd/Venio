import type { Types } from 'mongoose'
import ProjectPhase from '../models/ProjectPhase.js'
import User from '../models/User.js'
import type { IProject, IProjectPhase } from '../types/models/index.js'
import type { PhaseStatus } from '../types/enums.js'

export type PhaseAdminAction = 'start' | 'request-validation' | 'complete' | 'cancel-validation-request' | 'revert'

export interface PhaseRefusal {
  status: number
  body: { error: string; code: string; blockingPhase?: { _id: string; title: string } }
}

export type TransitionOutcome = { ok: true; nextStatus: PhaseStatus } | { ok: false; refusal: PhaseRefusal }

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  A_VENIR: 'À venir',
  EN_COURS: 'En cours',
  EN_ATTENTE_VALIDATION: 'En attente de validation client',
  TERMINEE: 'Terminée',
}

/** Une étape n'est validée que si le client l'a horodatée. */
export function isPhaseValidated(phase: Pick<IProjectPhase, 'validation'>): boolean {
  return Boolean(phase.validation?.validatedAt)
}

function refuse(status: number, error: string, code: string): TransitionOutcome {
  return { ok: false, refusal: { status, body: { error, code } } }
}

const invalidTransition = (): TransitionOutcome =>
  refuse(409, 'Cette transition n’est pas autorisée pour cette étape', 'INVALID_TRANSITION')

/**
 * Unique source de vérité du tableau des transitions admin. `blockingPhase` est
 * résolu par l'appelant via findBlockingPhase() : la fonction reste pure et
 * donc testable sans base.
 */
export function resolveAdminTransition(
  phase: IProjectPhase,
  action: PhaseAdminAction,
  blockingPhase: IProjectPhase | null,
): TransitionOutcome {
  switch (action) {
    case 'start': {
      if (phase.status !== 'A_VENIR') return invalidTransition()
      if (blockingPhase) {
        return {
          ok: false,
          refusal: {
            status: 409,
            body: {
              error: `L’étape « ${blockingPhase.title} » doit d’abord être validée par le client`,
              code: 'PHASE_LOCKED',
              blockingPhase: { _id: String(blockingPhase._id), title: blockingPhase.title },
            },
          },
        }
      }
      return { ok: true, nextStatus: 'EN_COURS' }
    }
    case 'request-validation': {
      if (phase.status !== 'EN_COURS') return invalidTransition()
      if (!phase.requiresClientValidation) {
        return refuse(409, 'Cette étape ne requiert pas de validation client', 'VALIDATION_NOT_REQUIRED')
      }
      return { ok: true, nextStatus: 'EN_ATTENTE_VALIDATION' }
    }
    case 'complete': {
      if (phase.status !== 'EN_COURS') return invalidTransition()
      if (phase.requiresClientValidation) {
        return refuse(
          409,
          'Cette étape doit être validée par le client avant d’être terminée',
          'CLIENT_VALIDATION_REQUIRED',
        )
      }
      return { ok: true, nextStatus: 'TERMINEE' }
    }
    case 'cancel-validation-request': {
      if (phase.status !== 'EN_ATTENTE_VALIDATION') return invalidTransition()
      return { ok: true, nextStatus: 'EN_COURS' }
    }
    case 'revert': {
      if (phase.status === 'EN_COURS') return { ok: true, nextStatus: 'A_VENIR' }
      if (phase.status === 'TERMINEE') {
        if (isPhaseValidated(phase)) {
          return refuse(409, 'Une étape validée par le client ne peut plus être modifiée', 'VALIDATED_PHASE_IMMUTABLE')
        }
        return { ok: true, nextStatus: 'EN_COURS' }
      }
      return invalidTransition()
    }
    default:
      return invalidTransition()
  }
}

/**
 * Règle de verrouillage : toute étape précédente exigeant une validation client
 * doit être validée. La règle porte sur *toutes* les étapes d'ordre inférieur,
 * ce qui la rend robuste au réordonnancement.
 */
export async function findBlockingPhase(
  projectId: string | Types.ObjectId,
  order: number,
): Promise<IProjectPhase | null> {
  return ProjectPhase.findOne({
    project: projectId,
    order: { $lt: order },
    requiresClientValidation: true,
    $or: [{ 'validation.validatedAt': null }, { 'validation.validatedAt': { $exists: false } }],
  }).sort({ order: 1 })
}

/**
 * Destinataires internes d'un événement d'étape : le responsable du projet
 * (s'il existe) et tous les SUPER_ADMIN actifs. notifyUsers() déduplique.
 */
export async function phaseAdminRecipients(project: IProject): Promise<string[]> {
  const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  const recipients = superAdmins.map((admin) => String(admin._id))
  if (project.assignedTo) recipients.unshift(String(project.assignedTo))
  return recipients
}
