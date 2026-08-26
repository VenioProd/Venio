import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { isPhaseValidated, PHASE_STATUS_LABELS, resolveAdminTransition } from './projectPhases.js'
import type { IProjectPhase } from '../types/models/index.js'

function phase(overrides: Partial<IProjectPhase> = {}): IProjectPhase {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'Maquettes',
    status: 'A_VENIR',
    order: 1,
    requiresClientValidation: false,
    validation: { validatedBy: null, validatedByName: '', validatedAt: null, comment: '' },
    ...overrides,
  } as unknown as IProjectPhase
}

const blocker = phase({ title: 'Cadrage', order: 0, requiresClientValidation: true })

describe('isPhaseValidated', () => {
  it('ne considère validée qu’une étape horodatée', () => {
    expect(isPhaseValidated(phase())).toBe(false)
    expect(
      isPhaseValidated(
        phase({ validation: { validatedBy: null, validatedByName: 'X', validatedAt: new Date(), comment: '' } }),
      ),
    ).toBe(true)
  })
})

describe('resolveAdminTransition — start', () => {
  it('démarre une étape à venir sans jalon bloquant', () => {
    expect(resolveAdminTransition(phase(), 'start', null)).toEqual({ ok: true, nextStatus: 'EN_COURS' })
  })

  it('refuse 409 PHASE_LOCKED en nommant l’étape bloquante', () => {
    const outcome = resolveAdminTransition(phase(), 'start', blocker)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.refusal.status).toBe(409)
    expect(outcome.refusal.body.code).toBe('PHASE_LOCKED')
    expect(outcome.refusal.body.blockingPhase).toEqual({ _id: String(blocker._id), title: 'Cadrage' })
  })

  it('refuse 409 INVALID_TRANSITION depuis un autre statut', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'start', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('resolveAdminTransition — request-validation', () => {
  it('met en attente une étape en cours à validation client', () => {
    const p = phase({ status: 'EN_COURS', requiresClientValidation: true })
    expect(resolveAdminTransition(p, 'request-validation', null)).toEqual({
      ok: true,
      nextStatus: 'EN_ATTENTE_VALIDATION',
    })
  })

  it('refuse 409 VALIDATION_NOT_REQUIRED si l’étape n’est pas un jalon client', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'request-validation', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'VALIDATION_NOT_REQUIRED' } } })
  })
})

describe('resolveAdminTransition — complete', () => {
  it('termine une étape en cours sans validation client', () => {
    expect(resolveAdminTransition(phase({ status: 'EN_COURS' }), 'complete', null)).toEqual({
      ok: true,
      nextStatus: 'TERMINEE',
    })
  })

  it('refuse 409 CLIENT_VALIDATION_REQUIRED sur un jalon client', () => {
    const p = phase({ status: 'EN_COURS', requiresClientValidation: true })
    const outcome = resolveAdminTransition(p, 'complete', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'CLIENT_VALIDATION_REQUIRED' } } })
  })
})

describe('resolveAdminTransition — cancel-validation-request', () => {
  it('ramène en cours une étape en attente', () => {
    expect(
      resolveAdminTransition(phase({ status: 'EN_ATTENTE_VALIDATION' }), 'cancel-validation-request', null),
    ).toEqual({ ok: true, nextStatus: 'EN_COURS' })
  })

  it('refuse 409 INVALID_TRANSITION hors attente de validation', () => {
    const outcome = resolveAdminTransition(phase({ status: 'EN_COURS' }), 'cancel-validation-request', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('resolveAdminTransition — revert', () => {
  it('ramène une étape en cours à venir', () => {
    expect(resolveAdminTransition(phase({ status: 'EN_COURS' }), 'revert', null)).toEqual({
      ok: true,
      nextStatus: 'A_VENIR',
    })
  })

  it('rouvre une étape terminée non validée', () => {
    expect(resolveAdminTransition(phase({ status: 'TERMINEE' }), 'revert', null)).toEqual({
      ok: true,
      nextStatus: 'EN_COURS',
    })
  })

  it('refuse 409 VALIDATED_PHASE_IMMUTABLE sur une étape validée', () => {
    const p = phase({
      status: 'TERMINEE',
      validation: { validatedBy: null, validatedByName: 'Claire', validatedAt: new Date(), comment: '' },
    })
    const outcome = resolveAdminTransition(p, 'revert', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { status: 409, body: { code: 'VALIDATED_PHASE_IMMUTABLE' } } })
  })

  it('refuse 409 INVALID_TRANSITION depuis A_VENIR', () => {
    const outcome = resolveAdminTransition(phase(), 'revert', null)
    expect(outcome).toMatchObject({ ok: false, refusal: { body: { code: 'INVALID_TRANSITION' } } })
  })
})

describe('PHASE_STATUS_LABELS', () => {
  it('couvre les quatre statuts en français', () => {
    expect(PHASE_STATUS_LABELS).toEqual({
      A_VENIR: 'À venir',
      EN_COURS: 'En cours',
      EN_ATTENTE_VALIDATION: 'En attente de validation client',
      TERMINEE: 'Terminée',
    })
  })
})
