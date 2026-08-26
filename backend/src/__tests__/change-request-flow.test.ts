import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ChangeRequest from '../models/ChangeRequest.js'
import AuditLog from '../models/AuditLog.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  promoteChangeRequestOnSignature,
  transitionChangeRequest,
} from '../lib/changeRequestFlow.js'

const actor = { id: '', name: 'Raphael', email: 'admin@example.test' }

async function seedRequest(overrides: Record<string, unknown> = {}) {
  const clientId = new mongoose.Types.ObjectId()
  return ChangeRequest.create({
    client: clientId,
    title: 'Module de réservation',
    description: 'Réserver un créneau depuis le site.',
    createdBy: clientId,
    createdByName: 'Claire Corbel',
    ...overrides,
  })
}

beforeAll(setupMongo)
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const admin = await User.create({
    name: 'Raphael',
    email: 'admin@example.test',
    passwordHash: 'x',
    role: 'SUPER_ADMIN',
    isActive: true,
  })
  actor.id = String(admin._id)
})

describe('transitions autorisées', () => {
  it('décrit le cycle de vie de la spec', () => {
    expect([...ALLOWED_TRANSITIONS.SOUMISE].sort()).toEqual(['A_CHIFFRER', 'PLANIFIEE', 'REFUSEE'])
    expect([...ALLOWED_TRANSITIONS.A_CHIFFRER].sort()).toEqual(['PLANIFIEE', 'REFUSEE'])
    expect(ALLOWED_TRANSITIONS.PLANIFIEE).toEqual(['EN_COURS'])
    expect(ALLOWED_TRANSITIONS.EN_COURS).toEqual(['LIVREE'])
    expect([...ALLOWED_TRANSITIONS.LIVREE].sort()).toEqual(['EN_COURS', 'VALIDEE'])
    // États terminaux : aucune route ne les mute.
    expect(ALLOWED_TRANSITIONS.VALIDEE).toEqual([])
    expect(ALLOWED_TRANSITIONS.REFUSEE).toEqual([])
  })

  it('rejette une transition non déclarée', () => {
    expect(canTransition('SOUMISE', 'LIVREE')).toBe(false)
    expect(canTransition('VALIDEE', 'EN_COURS')).toBe(false)
    expect(canTransition('LIVREE', 'VALIDEE')).toBe(true)
  })
})

describe('transitionChangeRequest', () => {
  it('pousse une entrée d’historique et applique les champs complémentaires', async () => {
    const created = await seedRequest({ status: 'EN_COURS' })
    const updated = await transitionChangeRequest({
      id: String(created._id),
      from: 'EN_COURS',
      to: 'LIVREE',
      actor,
      note: 'Mise en ligne effectuée',
      set: { deliveredAt: new Date('2026-08-22T10:00:00Z') },
    })

    expect(updated!.status).toBe('LIVREE')
    expect(updated!.deliveredAt).toEqual(new Date('2026-08-22T10:00:00Z'))
    expect(updated!.statusHistory).toHaveLength(1)
    expect(updated!.statusHistory[0]!.status).toBe('LIVREE')
    expect(updated!.statusHistory[0]!.byName).toBe('Raphael')
    expect(updated!.statusHistory[0]!.note).toBe('Mise en ligne effectuée')
  })

  it('renvoie null quand l’état courant n’est pas celui attendu', async () => {
    const created = await seedRequest({ status: 'SOUMISE' })
    const updated = await transitionChangeRequest({
      id: String(created._id),
      from: 'EN_COURS',
      to: 'LIVREE',
      actor,
    })

    expect(updated).toBeNull()
    expect((await ChangeRequest.findById(created._id))!.status).toBe('SOUMISE')
  })

  it('n’applique qu’une seule fois deux transitions concurrentes', async () => {
    const created = await seedRequest({ status: 'PLANIFIEE' })
    const results = await Promise.all([
      transitionChangeRequest({ id: String(created._id), from: 'PLANIFIEE', to: 'EN_COURS', actor }),
      transitionChangeRequest({ id: String(created._id), from: 'PLANIFIEE', to: 'EN_COURS', actor }),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect((await ChangeRequest.findById(created._id))!.statusHistory).toHaveLength(1)
  })
})

describe('promoteChangeRequestOnSignature', () => {
  it('planifie la demande liée, trace et notifie', async () => {
    const proposalId = new mongoose.Types.ObjectId()
    const created = await seedRequest({
      status: 'A_CHIFFRER',
      qualification: 'A_CHIFFRER',
      quoteProposal: proposalId,
    })

    const promoted = await promoteChangeRequestOnSignature({ _id: proposalId }, actor)

    expect(promoted!.status).toBe('PLANIFIEE')
    expect(promoted!.statusHistory[0]!.status).toBe('PLANIFIEE')
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_PLANNED' })).toBe(1)
    expect((await ChangeRequest.findById(created._id))!.status).toBe('PLANIFIEE')
  })

  it('ne fait rien pour un devis sans demande liée', async () => {
    const promoted = await promoteChangeRequestOnSignature({ _id: new mongoose.Types.ObjectId() }, actor)

    expect(promoted).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'CHANGE_REQUEST_PLANNED' })).toBe(0)
  })

  it('laisse intacte une demande liée qui n’est plus A_CHIFFRER', async () => {
    const proposalId = new mongoose.Types.ObjectId()
    const created = await seedRequest({
      status: 'REFUSEE',
      qualification: 'A_CHIFFRER',
      quoteProposal: proposalId,
      refusalReason: 'Hors périmètre',
    })

    expect(await promoteChangeRequestOnSignature({ _id: proposalId }, actor)).toBeNull()
    expect((await ChangeRequest.findById(created._id))!.status).toBe('REFUSEE')
  })
})
