import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from '../__tests__/helpers/mongoTestEnv.js'
import ArrowSchool from '../models/ArrowSchool.js'
import Lead from '../models/Lead.js'
import Notification from '../models/Notification.js'
import { mapArrowSchoolToLead, migrateArrowSchoolsToLeads } from './migrateArrowSchoolsToLeads.js'

const actor = new mongoose.Types.ObjectId()
const log = vi.fn()
const statuses = [
  ['A_PROSPECTER', 'LEAD'],
  ['CONTACTE', 'CONTACTED'],
  ['REPONSE', 'QUALIFIED'],
  ['DEMO_PLANIFIEE', 'DEMO'],
  ['DEMO_FAITE', 'DEMO'],
  ['PROPOSITION', 'PROPOSAL'],
  ['SIGNE', 'WON'],
  ['NON_INTERESSE', 'LOST'],
] as const

describe('mapping des écoles Arrow dans le CRM principal (sans base)', () => {
  afterEach(() => vi.restoreAllMocks())

  function mockSchoolCursor() {
    const school = new ArrowSchool({ name: 'École test', createdBy: actor })
    const query = {
      sort: () => query,
      cursor: async function* () {
        yield school
      },
    }
    vi.spyOn(ArrowSchool, 'find').mockReturnValue(query as never)
    return school
  }

  it('couvre exactement les enums sources et valide tous les statuts et températures dans Lead', async () => {
    expect(statuses.map(([status]) => status)).toEqual(ArrowSchool.schema.path('status').options.enum)
    const temperatures = ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'] as const
    expect(temperatures).toEqual(ArrowSchool.schema.path('temperature').options.enum)
    for (const [status, expected] of statuses) {
      for (const temperature of temperatures) {
        const school = new ArrowSchool({ name: 'École test', status, temperature, createdBy: actor }).toObject()
        const mapped = mapArrowSchoolToLead(school)
        expect(mapped.status).toBe(expected)
        expect(mapped.leadTemperature).toBe(temperature)
        await expect(new Lead(mapped).validate()).resolves.toBeUndefined()
      }
    }
  })

  it('le dry-run valide le lead sans écriture ni création d’index', async () => {
    mockSchoolCursor()
    vi.spyOn(Lead, 'exists').mockResolvedValue(null)
    const write = vi.spyOn(Lead, 'updateOne')
    const index = vi.spyOn(Lead.collection, 'createIndex')
    expect(await migrateArrowSchoolsToLeads({ dryRun: true, log })).toMatchObject({
      scanned: 1,
      wouldCreate: 1,
      created: 0,
      failed: 0,
    })
    expect(write).not.toHaveBeenCalled()
    expect(index).not.toHaveBeenCalled()
  })

  it('saute les écoles déjà migrées à chaque reprise en utilisant la provenance unique', async () => {
    const school = mockSchoolCursor()
    const exists = vi.spyOn(Lead, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    vi.spyOn(Lead.collection, 'createIndex').mockResolvedValue('legacyArrowSchoolId_1')
    const write = vi.spyOn(Lead, 'updateOne')
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(await migrateArrowSchoolsToLeads({ log })).toMatchObject({ scanned: 1, created: 0, skipped: 1, failed: 0 })
    }
    expect(exists).toHaveBeenCalledWith({ legacyArrowSchoolId: school._id })
    expect(write).not.toHaveBeenCalled()
    expect(Lead.schema.indexes()).toContainEqual([
      { legacyArrowSchoolId: 1 },
      expect.objectContaining({ unique: true, sparse: true }),
    ])
  })
})

describe('migration des écoles Arrow dans le CRM principal (MongoDB)', () => {
  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(clearDb)

  it('préserve les données, les dates et toutes les relances, même archivées, sans notification', async () => {
    const createdAt = new Date('2025-01-01T12:00:00Z')
    const updatedAt = new Date('2026-02-01T12:00:00Z')
    const nextActionAt = new Date('2026-03-01T12:00:00Z')
    const school = new ArrowSchool({
      name: 'Lycée Victor Hugo',
      schoolType: 'LYCEE',
      city: 'Paris',
      region: 'Île-de-France',
      studentCount: 0,
      contactName: 'Camille',
      contactRole: 'Direction',
      contactEmail: 'camille@ecole.test',
      emailGeneral: 'accueil@ecole.test',
      contactPhone: '0123456789',
      source: 'Réseau',
      notes: 'Notes originales',
      status: 'DEMO_FAITE',
      temperature: 'TRES_CHAUD',
      createdBy: actor,
      assignedTo: actor,
      nextActionAt,
      lastContactAt: updatedAt,
      statusChangedAt: updatedAt,
      isArchived: true,
      createdAt,
      updatedAt,
      relances: [
        { date: updatedAt, done: true, note: 'Appel effectué\nIntéressé' },
        { date: nextActionAt, done: false, note: 'Envoyer la proposition' },
        { date: null, done: false, note: '' },
      ],
    })
    // Le save standard remplace updatedAt par createdAt à l'insertion.
    // Cette fixture représente les véritables dates historiques à conserver.
    await school.save({ timestamps: false })
    const summary = await migrateArrowSchoolsToLeads({ log })
    expect(summary).toEqual({ scanned: 1, created: 1, skipped: 0, wouldCreate: 0, failed: 0, relances: 3 })
    const lead = await Lead.findOne({ legacyArrowSchoolId: school._id }).lean()
    expect(lead).toMatchObject({
      company: school.name,
      project: 'ARROW',
      status: 'DEMO',
      leadTemperature: 'TRES_CHAUD',
      contactName: school.contactName,
      contactEmail: school.contactEmail,
      contactPhone: school.contactPhone,
      source: 'Réseau',
      assignedTo: actor,
      createdBy: actor,
      nextActionAt,
      lastContactAt: updatedAt,
      statusChangedAt: updatedAt,
      createdAt,
      updatedAt,
    })
    for (const fragment of [
      'Notes originales',
      `arrow-school:${school._id}`,
      'Statut Arrow : DEMO_FAITE',
      'Archivée dans Arrow : oui',
      'Paris',
      'Île-de-France',
      'LYCEE',
      'Effectif : 0',
      'Direction',
      'accueil@ecole.test',
      '2026-02-01T12:00:00.000Z | faite | Appel effectué\nIntéressé',
      '2026-03-01T12:00:00.000Z | à faire | Envoyer la proposition',
      'Relance 3 | sans date | à faire |',
    ]) {
      expect(lead?.notes).toContain(fragment)
    }
    expect(await ArrowSchool.findById(school._id).lean()).toEqual(school.toObject())
    expect(await Notification.countDocuments()).toBe(0)
  })

  it('simule sans écrire puis saute les écoles déjà migrées sans écraser les corrections CRM', async () => {
    const school = await ArrowSchool.create({ name: 'Université', emailGeneral: 'info@ecole.test', createdBy: actor })
    const dry = await migrateArrowSchoolsToLeads({ dryRun: true, log })
    expect(dry).toMatchObject({ scanned: 1, wouldCreate: 1, created: 0, failed: 0 })
    expect(await Lead.countDocuments()).toBe(0)
    await migrateArrowSchoolsToLeads({ log })
    const lead = await Lead.findOne({ legacyArrowSchoolId: school._id }).lean()
    expect(lead?.contactEmail).toBe('info@ecole.test')
    await Lead.updateOne({ _id: lead!._id }, { $set: { notes: 'Corrigé dans le CRM', company: 'Nouveau nom' } })
    const before = await Lead.findById(lead!._id).lean()
    const again = await migrateArrowSchoolsToLeads({ log })
    expect(again).toMatchObject({ scanned: 1, skipped: 1, created: 0, failed: 0 })
    expect(await Lead.findById(lead!._id).lean()).toEqual(before)
    expect(await Lead.countDocuments()).toBe(1)
    const dryAgain = await migrateArrowSchoolsToLeads({ dryRun: true, log })
    expect(dryAgain).toMatchObject({ skipped: 1, wouldCreate: 0 })
  })

  it('reste idempotente si deux migrations tournent en même temps et laisse les autres leads intacts', async () => {
    const other = await Lead.create({ company: 'Autre lead', project: 'VIGNO' })
    await Lead.create({ company: 'Lead sans provenance' }) // index sparse : plusieurs leads ordinaires autorisés
    await ArrowSchool.create({ name: 'École simultanée', createdBy: actor })
    const results = await Promise.all([migrateArrowSchoolsToLeads({ log }), migrateArrowSchoolsToLeads({ log })])
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1)
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(1)
    expect(results.every((result) => result.failed === 0)).toBe(true)
    expect(await Lead.countDocuments()).toBe(3)
    expect(await Lead.findById(other._id).lean()).toEqual(other.toObject())
  })

  it('compte les erreurs, poursuit les écoles valides et permet une reprise après correction', async () => {
    const bad = await ArrowSchool.create({ name: 'Statut invalide', temperature: 'FROID', createdBy: actor })
    await ArrowSchool.collection.updateOne({ _id: bad._id }, { $set: { status: 'UNKNOWN' } })
    await ArrowSchool.create({ name: 'École valide', createdBy: actor })
    const summary = await migrateArrowSchoolsToLeads({ log })
    expect(summary).toMatchObject({ scanned: 2, created: 1, failed: 1 })
    await ArrowSchool.updateOne({ _id: bad._id }, { $set: { status: 'A_PROSPECTER' } })
    const resumed = await migrateArrowSchoolsToLeads({ log })
    expect(resumed).toMatchObject({ scanned: 2, created: 1, skipped: 1, failed: 0 })
  })
})
